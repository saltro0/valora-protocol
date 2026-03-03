import {
  Client,
  AccountCreateTransaction,
  AccountId,
  PrivateKey,
  PublicKey,
  Hbar,
} from '@hashgraph/sdk'
import { compressPublicKey, computeEvmAddress } from '@/lib/utils/crypto'

const NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet'
const CREATOR_ID = process.env.CUSTODIAL_CREATOR_ACCOUNT_ID!
const CREATOR_KEY = process.env.CUSTODIAL_CREATOR_PRIVATE_KEY!

class LedgerService {
  /**
   * Build a Hedera client with the creator operator (limited-balance account).
   */
  private buildClient(): Client {
    const client =
      NETWORK === 'testnet' ? Client.forTestnet() : Client.forMainnet()

    client.setOperator(
      AccountId.fromString(CREATOR_ID),
      PrivateKey.fromStringECDSA(CREATOR_KEY)
    )
    return client
  }

  /**
   * Open a new Hedera account using a KMS-managed public key.
   * The creator operator pays the creation fee; initial balance is zero.
   */
  async openAccount(publicKeyHex: string): Promise<string> {
    const client = this.buildClient()

    try {
      const uncompressed = Buffer.from(publicKeyHex, 'hex')
      const compressed = compressPublicKey(uncompressed)
      const key = PublicKey.fromBytesECDSA(compressed)

      const tx = await new AccountCreateTransaction()
        .setKey(key)
        .setInitialBalance(new Hbar(0))
        .setMaxAutomaticTokenAssociations(10)
        .execute(client)

      const receipt = await tx.getReceipt(client)
      return receipt.accountId!.toString()
    } finally {
      client.close()
    }
  }

  /**
   * Derive the EVM address from an uncompressed public key.
   */
  deriveAddress(publicKeyHex: string): string {
    return computeEvmAddress(publicKeyHex)
  }
}

export const ledger = new LedgerService()
