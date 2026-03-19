import {
  KMSClient,
  CreateKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
} from '@aws-sdk/client-kms'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { extractRawPublicKey, decodeSignature } from '@/lib/utils/crypto'
import type { VaultKeyInfo, VaultSignResult } from '@/types'

const REGION = process.env.AWS_KMS_REGION || 'us-east-1'

class VaultService {
  private client: KMSClient | null = null

  private getClient(): KMSClient {
    if (!this.client) {
      this.client = new KMSClient({ region: REGION })
    }
    return this.client
  }

  /**
   * Provision a new ECDSA secp256k1 signing key in AWS KMS.
   */
  async provisionSigningKey(userId: string): Promise<VaultKeyInfo> {
    const kms = this.getClient()

    const result = await kms.send(
      new CreateKeyCommand({
        KeySpec: 'ECC_SECG_P256K1',
        KeyUsage: 'SIGN_VERIFY',
        Description: `Valora Protocol signing key — user ${userId}`,
        Tags: [
          { TagKey: 'service', TagValue: 'valora-protocol' },
          { TagKey: 'user_id', TagValue: userId },
        ],
      })
    )

    const keyId = result.KeyMetadata!.KeyId!
    const keyArn = result.KeyMetadata!.Arn!
    const publicKeyHex = await this.retrievePublicKey(keyId)

    return { keyId, keyArn, publicKeyHex }
  }

  /**
   * Retrieve the raw 65-byte uncompressed public key as hex.
   */
  async retrievePublicKey(keyId: string): Promise<string> {
    const kms = this.getClient()
    const result = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }))
    const spki = new Uint8Array(result.PublicKey!)
    const raw = extractRawPublicKey(spki)
    return Buffer.from(raw).toString('hex')
  }

  /**
   * Sign a transaction digest via KMS.
   * Hashes with keccak256, then signs the 32-byte digest.
   */
  async signDigest(
    keyId: string,
    bodyBytes: Uint8Array
  ): Promise<VaultSignResult> {
    const kms = this.getClient()
    const digest = keccak_256(new Uint8Array(bodyBytes))

    const result = await kms.send(
      new SignCommand({
        KeyId: keyId,
        Message: digest,
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    )

    const raw = decodeSignature(new Uint8Array(result.Signature!))
    return { signature: raw }
  }

  /**
   * Verify a key is active and enabled.
   */
  async isKeyActive(keyId: string): Promise<boolean> {
    try {
      const kms = this.getClient()
      const res = await kms.send(new DescribeKeyCommand({ KeyId: keyId }))
      return res.KeyMetadata?.Enabled === true
    } catch {
      return false
    }
  }

  /**
   * Disable a key (for rotation, never deletes).
   */
  async deactivateKey(keyId: string): Promise<void> {
    const kms = this.getClient()
    await kms.send(new DisableKeyCommand({ KeyId: keyId }))
  }
}

export const vault = new VaultService()
