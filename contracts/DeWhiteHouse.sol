// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC721Like {
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @title DeWhiteHouse
 * @notice Yonetimsiz, backend'siz, tamamen zincir ustu teklif ve oylama.
 *
 *  flooor.fun'daki epoch mantigi gibi turlar kendiliginden doner:
 *    tur no  = block.timestamp / ROUND_LENGTH
 *    ilk 16 saat: teklif donemi
 *    son 8 saat: oylama donemi
 *
 *  - Herkes hazineye ETH ekleyebilir (mevcut veya gelecek tur icin).
 *  - Koleksiyon sahipleri teklif doneminde bir teklif yazar.
 *  - Oylama doneminde oy gucu = balanceOf. Oylar tekliflere dagitilir.
 *  - Tur bitince ilk yazma islemi (teklif, oy, hazine) onceki turu OTOMATIK
 *    kapatir: en cok oy alan NUM_WINNERS teklif hazineyi esit paylasir ve
 *    odeme kazananlara dogrudan gonderilir. Odenmeyen bakiye sonraki tura
 *    devreder. Isteyen settle(roundId) ile elle de tetikleyebilir.
 *
 *  Sahip yok. Iptal yok. Duzenleme yok. Kimse kazanan secemez.
 */
contract DeWhiteHouse {
    // ---------------------------------------------------------------------
    // Sabitler
    // ---------------------------------------------------------------------
    uint256 public constant ROUND_LENGTH = 24 hours;
    uint256 public constant PROPOSING_LENGTH = 16 hours; // kalan 8 saat oylama (flooor 16/8)
    uint256 public constant NUM_WINNERS = 3;
    uint256 public constant MAX_PROPOSALS_PER_ROUND = 64;
    uint256 public constant MAX_TITLE_BYTES = 120;
    uint256 public constant MAX_TLDR_BYTES = 280;
    uint256 public constant MAX_BODY_BYTES = 6000;
    uint256 public constant MAX_AUTO_SETTLE = 3; // tek islemde en fazla bu kadar tur kapanir

    IERC721Like public immutable collection;
    bool private locked;

    // ---------------------------------------------------------------------
    // Durum
    // ---------------------------------------------------------------------
    enum Phase {
        Proposing,
        Voting,
        Ended,
        Finalized
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

    Proposal[] private _proposals;

    mapping(uint256 => uint256) public budget; // roundId => wei
    mapping(uint256 => bool) public finalized;
    mapping(uint256 => uint256[]) private _roundProposalIds;
    mapping(uint256 => uint256[]) private _roundWinners;
    mapping(uint256 => mapping(address => uint256)) public votesUsed;
    mapping(uint256 => mapping(address => bool)) public hasProposed;

    // Arsiv icin: hareket goren tur numaralari
    uint256[] private _touchedRounds;
    mapping(uint256 => bool) private _touched;

    // Otomatik kapanis kuyrugu: sadece "o an mevcut" olan turlar eklenir, bu
    // yuzden artan siradadir. _settlePtr'den itibaren bitmis olanlar kapatilir.
    uint256[] private _settleQueue;
    mapping(uint256 => bool) private _queued;
    uint256 private _settlePtr;

    // Dogrudan odeme basarisiz olursa (ornegin ETH kabul etmeyen kontrat) pay
    // burada bekler ve withdraw() ile cekilir. Digerlerinin odemesini bloklamaz.
    mapping(address => uint256) public pendingWithdrawals;

    // ---------------------------------------------------------------------
    // Olaylar
    // ---------------------------------------------------------------------
    event Funded(uint256 indexed roundId, address indexed from, uint256 amount, uint256 newBudget);
    event ProposalSubmitted(uint256 indexed roundId, uint256 indexed proposalId, address indexed proposer, string title);
    event VoteCast(uint256 indexed roundId, uint256 indexed proposalId, address indexed voter, uint256 weight);
    event RoundSettled(uint256 indexed roundId, uint256[] winners, uint256 perWinner, uint256 rolledOver);
    event Paid(address indexed to, uint256 amount, bool direct);
    event Withdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------------
    // Degistiriciler
    // ---------------------------------------------------------------------
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
    }

    // ---------------------------------------------------------------------
    // Hazine
    // ---------------------------------------------------------------------

    /// @notice Mevcut turun hazinesine ekler.
    receive() external payable nonReentrant {
        _autoSettle();
        _fund(currentRoundId());
    }

    /// @notice Belirli bir turun hazinesine ekler (mevcut veya gelecek).
    function fund(uint256 roundId) external payable nonReentrant {
        require(roundId >= currentRoundId(), "round is over");
        _autoSettle();
        _fund(roundId);
    }

    function _fund(uint256 roundId) private {
        require(msg.value > 0, "zero value");
        _touch(roundId);
        if (roundId == currentRoundId()) _enqueue(roundId);
        budget[roundId] += msg.value;
        emit Funded(roundId, msg.sender, msg.value, budget[roundId]);
    }

    // ---------------------------------------------------------------------
    // Teklif
    // ---------------------------------------------------------------------

    function propose(string calldata title, string calldata tldr, string calldata body)
        external
        onlyHolder
        nonReentrant
        returns (uint256 proposalId)
    {
        _autoSettle();
        uint256 roundId = currentRoundId();
        require(phaseOf(roundId) == Phase.Proposing, "not proposing period");
        require(!hasProposed[roundId][msg.sender], "one proposal per wallet");
        require(_roundProposalIds[roundId].length < MAX_PROPOSALS_PER_ROUND, "round full");
        require(bytes(title).length > 0 && bytes(title).length <= MAX_TITLE_BYTES, "bad title");
        require(bytes(tldr).length > 0 && bytes(tldr).length <= MAX_TLDR_BYTES, "bad tldr");
        require(bytes(body).length <= MAX_BODY_BYTES, "body too long");

        _touch(roundId);
        _enqueue(roundId);
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
        hasProposed[roundId][msg.sender] = true;

        emit ProposalSubmitted(roundId, proposalId, msg.sender, title);
    }

    // ---------------------------------------------------------------------
    // Oy
    // ---------------------------------------------------------------------

    function vote(uint256 proposalId, uint256 weight) external onlyHolder nonReentrant {
        _autoSettle();
        require(proposalId < _proposals.length, "no such proposal");
        Proposal storage p = _proposals[proposalId];
        uint256 roundId = p.roundId;
        require(phaseOf(roundId) == Phase.Voting, "not voting period");
        require(weight > 0, "zero weight");

        uint256 power = collection.balanceOf(msg.sender);
        uint256 used = votesUsed[roundId][msg.sender];
        require(used + weight <= power, "exceeds voting power");

        votesUsed[roundId][msg.sender] = used + weight;
        p.votes += weight;
        emit VoteCast(roundId, proposalId, msg.sender, weight);
    }

    function voteBatch(uint256[] calldata proposalIds, uint256[] calldata weights) external onlyHolder nonReentrant {
        _autoSettle();
        require(proposalIds.length == weights.length && proposalIds.length > 0, "length mismatch");
        require(proposalIds[0] < _proposals.length, "no such proposal");
        uint256 roundId = _proposals[proposalIds[0]].roundId;
        require(phaseOf(roundId) == Phase.Voting, "not voting period");

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

        uint256 power = collection.balanceOf(msg.sender);
        uint256 used = votesUsed[roundId][msg.sender];
        require(used + total <= power, "exceeds voting power");
        votesUsed[roundId][msg.sender] = used + total;
    }

    // ---------------------------------------------------------------------
    // Sonuc
    // ---------------------------------------------------------------------

    /// @notice Bitmis bir turu elle kapatir. Normalde gerek yok, her yazma
    ///         islemi zaten otomatik kapatir. Herkes cagirabilir.
    function settle(uint256 roundId) external nonReentrant {
        require(phaseOf(roundId) == Phase.Ended, "round not ended");
        _settle(roundId);
    }

    /// @notice Dogrudan odeme basarisiz olmus kazananlar payini buradan ceker.
    function withdraw() external nonReentrant {
        uint256 amt = pendingWithdrawals[msg.sender];
        require(amt > 0, "nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amt}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amt);
    }

    /// @dev Kuyruktaki bitmis turlari sirayla kapatir. Gaz sinirini asmamak
    ///      icin bir cagrida en fazla MAX_AUTO_SETTLE tur.
    function _autoSettle() private {
        uint256 len = _settleQueue.length;
        uint256 done;
        while (_settlePtr < len && done < MAX_AUTO_SETTLE) {
            uint256 id = _settleQueue[_settlePtr];
            if (phaseOf(id) == Phase.Ended) {
                _settle(id);
            } else if (phaseOf(id) != Phase.Finalized) {
                break; // mevcut tur; henuz bitmedi
            }
            _settlePtr += 1;
            done += 1;
        }
    }

    function _settle(uint256 roundId) private {
        finalized[roundId] = true;

        uint256[] memory ids = _roundProposalIds[roundId];
        uint256 n = ids.length;
        uint256 k = NUM_WINNERS < n ? NUM_WINNERS : n;

        uint256[] memory picked = new uint256[](k);
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
            picked[count++] = ids[bestIdx];
            ids[bestIdx] = type(uint256).max;
        }

        uint256 pool = budget[roundId];
        budget[roundId] = 0;
        uint256 perWinner = count > 0 ? pool / count : 0;
        uint256 rolled = pool - perWinner * count;

        uint256[] memory winners = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            winners[i] = picked[i];
            _proposals[picked[i]].won = true;
            _roundWinners[roundId].push(picked[i]);
        }

        // Odenmeyen bakiye mevcut tura devreder (flooor leftover devri gibi)
        if (rolled > 0) {
            uint256 next = currentRoundId();
            if (next <= roundId) next = roundId + 1;
            _touch(next);
            _enqueue(next);
            budget[next] += rolled;
        }

        emit RoundSettled(roundId, winners, perWinner, rolled);

        // Kazananlara dogrudan odeme; basarisiz olursa pull'a duser
        for (uint256 i = 0; i < count; i++) {
            _pay(_proposals[picked[i]].proposer, perWinner);
        }
    }

    // ---------------------------------------------------------------------
    // Okuma
    // ---------------------------------------------------------------------

    function currentRoundId() public view returns (uint256) {
        return block.timestamp / ROUND_LENGTH;
    }

    function roundStart(uint256 roundId) public pure returns (uint256) {
        return roundId * ROUND_LENGTH;
    }

    function proposingEnd(uint256 roundId) public pure returns (uint256) {
        return roundId * ROUND_LENGTH + PROPOSING_LENGTH;
    }

    function votingEnd(uint256 roundId) public pure returns (uint256) {
        return (roundId + 1) * ROUND_LENGTH;
    }

    function phaseOf(uint256 roundId) public view returns (Phase) {
        if (finalized[roundId]) return Phase.Finalized;
        uint256 t = block.timestamp;
        if (t < proposingEnd(roundId)) return Phase.Proposing; // gelecek turlar da "Proposing" gorunur
        if (t < votingEnd(roundId)) return Phase.Voting;
        return Phase.Ended;
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
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

    function roundProposalCount(uint256 roundId) external view returns (uint256) {
        return _roundProposalIds[roundId].length;
    }

    /// @notice Kapanmayi bekleyen (bitmis ama henuz kapatilmamis) tur sayisi.
    function pendingSettlements() external view returns (uint256 n) {
        for (uint256 i = _settlePtr; i < _settleQueue.length; i++) {
            if (phaseOf(_settleQueue[i]) == Phase.Ended) n++;
        }
    }

    /// @notice Hareket gormus tur numaralari (arsiv listesi icin).
    function touchedRounds() external view returns (uint256[] memory) {
        return _touchedRounds;
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

    function _touch(uint256 roundId) private {
        if (!_touched[roundId]) {
            _touched[roundId] = true;
            _touchedRounds.push(roundId);
        }
    }

    function _enqueue(uint256 roundId) private {
        if (!_queued[roundId]) {
            _queued[roundId] = true;
            _settleQueue.push(roundId);
        }
    }

    /// @dev Sinirli gazla dogrudan gonderir; olmazsa withdraw icin biriktirir.
    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount, gas: 30_000}("");
        if (!ok) pendingWithdrawals[to] += amount;
        emit Paid(to, amount, ok);
    }
}
