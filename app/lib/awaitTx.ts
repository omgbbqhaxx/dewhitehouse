// writeContract, cuzdan islemi aga gonderdigi anda hash ile doner. Basari
// ancak receipt "success" dondugunde kesinlesir; bu yardimci onu tek yerden saglar.
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Hash } from "viem";
import { toast } from "sonner";

export const awaitTx = async (
  config: Config,
  hash: Hash,
  chainId: number,
): Promise<boolean> => {
  const pending = toast.loading("Submitted — awaiting confirmation on Base…");
  try {
    const receipt = await waitForTransactionReceipt(config, { hash, chainId });
    if (receipt.status !== "success") {
      toast.error("Transaction reverted on-chain. Nothing was changed.");
      return false;
    }
    return true;
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    toast.error(
      msg.includes("replaced") || msg.includes("cancel")
        ? "Transaction was cancelled or replaced in your wallet."
        : "Couldn't confirm the transaction. Check your wallet activity.",
    );
    return false;
  } finally {
    toast.dismiss(pending);
  }
};
