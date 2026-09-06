// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC-721 surface used for gating.
interface IERC721Like {
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @title DeWhiteHouse
 * @notice Prop House'un zamanli tur mantigi, backend'siz ve tamamen zincir ustunde.
 *
 *  - Yonetim (administration) bir tur acar ve odul havuzunu ETH olarak yatirir.
 *  - Koleksiyon (VRNouns) sahipleri teklif dönemi boyunca teklif yazar.
 *  - Oylama doneminde sahipler oylarini tekliflere dagitir. Oy gucu = balanceOf.
 *  - Oylama bitince herkes finalize cagirabilir: teklifler oya gore siralanir,
 *    ilk numWinners teklif esit pay alir. Oy almayan teklif kazanamaz.
 *
 *  Kalici veri: tur, teklif metni, oylar, kazananlar. Sunucu yok, veritabani yok.
 */
contract DeWhiteHouse {
    // ---------------------------------------------------------------------
    // Sabitler
    // ---------------------------------------------------------------------
    uint256 public constant MAX_PROPOSALS_PER_ROUND = 64;
    uint256 public constant MAX_TITLE_BYTES = 120;
    uint256 public constant MAX_TLDR_BYTES = 280;
    uint256 public constant MAX_BODY_BYTES = 6000;

    // ---------------------------------------------------------------------
    // Durum
    // ---------------------------------------------------------------------
    IERC721Like public immutable collection;
    address public administration;
    bool private locked;

    enum RoundState {
        NotStarted,
        Proposing,
        Voting,
        Ended,
        Finalized,
        Cancelled
    }

    struct Round {
        string title;
        string description;
        uint64 proposingStart;
        uint64 proposingEnd;
        uint64 votingEnd;
        uint16 numWinners;
        uint256 budget; // toplam odul havuzu (wei)
        uint256 proposalCount;
        bool finalized;
        bool cancelled;
    }

    struct Proposal {
        uint256 id;
        uint256 roundId;
        address proposer;
        string title;
        string tldr;
        string body;
        uint256 votes;
        uint64 createdAt;
        bool won;
    }

    Round[] private _rounds;
    Proposal[] private _proposals;

    mapping(uint256 => uint256[]) private _roundProposalIds;
    mapping(uint256 => uint256[]) private _roundWinners;
    mapping(uint256 => mapping(address => uint256)) public votesUsed;
    mapping(uint256 => mapping(address => bool)) public hasProposed;

    // ---------------------------------------------------------------------
    // Olaylar
    // ---------------------------------------------------------------------
    event RoundCreated(uint256 indexed roundId, string title, uint64 proposingStart, uint64 proposingEnd, uint64 votingEnd, uint16 numWinners, uint256 budget);
    event RoundFunded(uint256 indexed roundId, address indexed from, uint256 amount, uint256 newBudget);
    event RoundCancelled(uint256 indexed roundId, uint256 refunded);
    event RoundFinalized(uint256 indexed roundId, uint256[] winners, uint256 perWinner);
    event ProposalSubmitted(uint256 indexed roundId, uint256 indexed proposalId, address indexed proposer, string title);
    event VoteCast(uint256 indexed roundId, uint256 indexed proposalId, address indexed voter, uint256 weight);
    event AdministrationTransferred(address indexed previous, address indexed next);

    // ---------------------------------------------------------------------
    // Degistiriciler
    // ---------------------------------------------------------------------
    modifier onlyAdministration() {
        require(msg.sender == administration, "not administration");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "reentrancy");
        locked = true;
        _;
        locked = false;
    }

    modifier onlyHolder() {
        require(collection.balanceOf(msg.sender) > 0, "must hold collection NFT");
        _;
    }

    constructor(address collection_) {
        require(collection_ != address(0), "zero collection");
        collection = IERC721Like(collection_);
        administration = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Yonetim
    // ---------------------------------------------------------------------

    /// @notice Yeni tur acar. Gonderilen ETH odul havuzu olur.
    function createRound(
        string calldata title,
        string calldata description,
        uint64 proposingStart,
        uint64 proposingDuration,
        uint64 votingDuration,
        uint16 numWinners
    ) external payable onlyAdministration returns (uint256 roundId) {
        require(bytes(title).length > 0 && bytes(title).length <= MAX_TITLE_BYTES, "bad title");
        require(bytes(description).length <= MAX_BODY_BYTES, "description too long");
        require(proposingDuration > 0 && votingDuration > 0, "bad durations");
        require(numWinners > 0 && numWinners <= MAX_PROPOSALS_PER_ROUND, "bad numWinners");
        if (proposingStart == 0) proposingStart = uint64(block.timestamp);

        roundId = _rounds.length;
        _rounds.push(
            Round({
                title: title,
                description: description,
                proposingStart: proposingStart,
                proposingEnd: proposingStart + proposingDuration,
                votingEnd: proposingStart + proposingDuration + votingDuration,
                numWinners: numWinners,
                budget: msg.value,
                proposalCount: 0,
                finalized: false,
                cancelled: false
            })
        );

        emit RoundCreated(roundId, title, proposingStart, proposingStart + proposingDuration, proposingStart + proposingDuration + votingDuration, numWinners, msg.value);
    }

    /// @notice Herkes bir turun havuzuna katki yapabilir (finalize oncesi).
    function fundRound(uint256 roundId) external payable {
        Round storage r = _round(roundId);
        require(!r.finalized && !r.cancelled, "round closed");
        require(msg.value > 0, "zero value");
        r.budget += msg.value;
        emit RoundFunded(roundId, msg.sender, msg.value, r.budget);
    }

    /// @notice Tur iptal edilir, havuz yonetime iade edilir.
    function cancelRound(uint256 roundId) external onlyAdministration nonReentrant {
        Round storage r = _round(roundId);
        require(!r.finalized && !r.cancelled, "round closed");
        r.cancelled = true;
        uint256 refund = r.budget;
        r.budget = 0;
        if (refund > 0) _pay(administration, refund);
        emit RoundCancelled(roundId, refund);
    }

    function transferAdministration(address next) external onlyAdministration {
        require(next != address(0), "zero address");
        emit AdministrationTransferred(administration, next);
        administration = next;
    }

    // ---------------------------------------------------------------------
    // Teklif
    // ---------------------------------------------------------------------

    function propose(
        uint256 roundId,
        string calldata title,
        string calldata tldr,
        string calldata body
    ) external onlyHolder returns (uint256 proposalId) {
        Round storage r = _round(roundId);
        require(roundState(roundId) == RoundState.Proposing, "not proposing period");
        require(!hasProposed[roundId][msg.sender], "one proposal per wallet");
        require(r.proposalCount < MAX_PROPOSALS_PER_ROUND, "round full");
        require(bytes(title).length > 0 && bytes(title).length <= MAX_TITLE_BYTES, "bad title");
        require(bytes(tldr).length > 0 && bytes(tldr).length <= MAX_TLDR_BYTES, "bad tldr");
        require(bytes(body).length <= MAX_BODY_BYTES, "body too long");

        proposalId = _proposals.length;
        _proposals.push(
            Proposal({
                id: proposalId,
                roundId: roundId,
                proposer: msg.sender,
                title: title,
                tldr: tldr,
                body: body,
                votes: 0,
                createdAt: uint64(block.timestamp),
                won: false
            })
        );
        _roundProposalIds[roundId].push(proposalId);
        r.proposalCount += 1;
        hasProposed[roundId][msg.sender] = true;

        emit ProposalSubmitted(roundId, proposalId, msg.sender, title);
    }

    // ---------------------------------------------------------------------
    // Oy
    // ---------------------------------------------------------------------

    /// @notice Oy gucu = koleksiyondaki bakiye. Bir tur icinde toplam agirlik bakiyeyi asamaz.
    function vote(uint256 proposalId, uint256 weight) external onlyHolder {
        require(proposalId < _proposals.length, "no such proposal");
        Proposal storage p = _proposals[proposalId];
        uint256 roundId = p.roundId;
        require(roundState(roundId) == RoundState.Voting, "not voting period");
        require(weight > 0, "zero weight");

        uint256 power = collection.balanceOf(msg.sender);
        uint256 used = votesUsed[roundId][msg.sender];
        require(used + weight <= power, "exceeds voting power");

        votesUsed[roundId][msg.sender] = used + weight;
        p.votes += weight;

        emit VoteCast(roundId, proposalId, msg.sender, weight);
    }

    /// @notice Birden fazla teklife tek islemde oy dagitir.
    function voteBatch(uint256[] calldata proposalIds, uint256[] calldata weights) external onlyHolder {
        require(proposalIds.length == weights.length && proposalIds.length > 0, "length mismatch");
        uint256 roundId = _proposals[proposalIds[0]].roundId;
        require(roundState(roundId) == RoundState.Voting, "not voting period");

        uint256 power = collection.balanceOf(msg.sender);
        uint256 used = votesUsed[roundId][msg.sender];
        uint256 total;

        for (uint256 i = 0; i < proposalIds.length; i++) {
            require(proposalIds[i] < _proposals.length, "no such proposal");
            Proposal storage p = _proposals[proposalIds[i]];
            require(p.roundId == roundId, "mixed rounds");
            require(weights[i] > 0, "zero weight");
            p.votes += weights[i];
            total += weights[i];
            emit VoteCast(roundId, proposalIds[i], msg.sender, weights[i]);
        }

        require(used + total <= power, "exceeds voting power");
        votesUsed[roundId][msg.sender] = used + total;
    }

    // ---------------------------------------------------------------------
    // Sonuc
    // ---------------------------------------------------------------------

    /// @notice Oylama bittikten sonra herkes cagirabilir. Kazananlara odeme yapar.
    function finalize(uint256 roundId) external nonReentrant {
        Round storage r = _round(roundId);
        require(roundState(roundId) == RoundState.Ended, "round not ended");

        uint256[] memory ids = _roundProposalIds[roundId];
        uint256 n = ids.length;
        uint256 k = r.numWinners < n ? r.numWinners : n;

        // Secim siralamasi: en cok oy alan k teklif. Beraberlikte erken teklif kazanir.
        uint256[] memory winners = new uint256[](k);
        uint256 count;
        for (uint256 slot = 0; slot < k; slot++) {
            uint256 bestIdx = type(uint256).max;
            uint256 bestVotes;
            for (uint256 i = 0; i < n; i++) {
                if (ids[i] == type(uint256).max) continue;
                uint256 v = _proposals[ids[i]].votes;
                if (v > bestVotes) {
                    bestVotes = v;
                    bestIdx = i;
                }
            }
            if (bestIdx == type(uint256).max || bestVotes == 0) break;
            winners[count++] = ids[bestIdx];
            ids[bestIdx] = type(uint256).max;
        }

        r.finalized = true;
        uint256 budget = r.budget;
        r.budget = 0;

        uint256 perWinner = count > 0 ? budget / count : 0;
        uint256[] memory finalWinners = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            finalWinners[i] = winners[i];
            _proposals[winners[i]].won = true;
            _roundWinners[roundId].push(winners[i]);
        }

        emit RoundFinalized(roundId, finalWinners, perWinner);

        for (uint256 i = 0; i < count; i++) {
            _pay(_proposals[winners[i]].proposer, perWinner);
        }
        uint256 leftover = budget - perWinner * count;
        if (leftover > 0) _pay(administration, leftover);
    }

    // ---------------------------------------------------------------------
    // Okuma
    // ---------------------------------------------------------------------

    function roundCount() external view returns (uint256) {
        return _rounds.length;
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return _round(roundId);
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposalId < _proposals.length, "no such proposal");
        return _proposals[proposalId];
    }

    function getRoundProposals(uint256 roundId) external view returns (Proposal[] memory out) {
        uint256[] storage ids = _roundProposalIds[roundId];
        out = new Proposal[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) out[i] = _proposals[ids[i]];
    }

    function getRoundWinners(uint256 roundId) external view returns (uint256[] memory) {
        return _roundWinners[roundId];
    }

    function roundState(uint256 roundId) public view returns (RoundState) {
        Round storage r = _round(roundId);
        if (r.cancelled) return RoundState.Cancelled;
        if (r.finalized) return RoundState.Finalized;
        if (block.timestamp < r.proposingStart) return RoundState.NotStarted;
        if (block.timestamp < r.proposingEnd) return RoundState.Proposing;
        if (block.timestamp < r.votingEnd) return RoundState.Voting;
        return RoundState.Ended;
    }

    function votingPower(address account) external view returns (uint256) {
        return collection.balanceOf(account);
    }

    function votesRemaining(uint256 roundId, address account) external view returns (uint256) {
        uint256 power = collection.balanceOf(account);
        uint256 used = votesUsed[roundId][account];
        return power > used ? power - used : 0;
    }

    // ---------------------------------------------------------------------
    // Ic
    // ---------------------------------------------------------------------

    function _round(uint256 roundId) private view returns (Round storage) {
        require(roundId < _rounds.length, "no such round");
        return _rounds[roundId];
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "transfer failed");
    }
}
