import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptPayload, encryptPayload, hashPayload, parseKeyRing } from './payload-crypto';
import type { KeyRing } from './payload-crypto';
import type { Env } from '../config/env';

/** DI wrapper over the pure payload-crypto helpers; the key ring is parsed once at boot. */
@Injectable()
export class PayloadCryptoService {
  private readonly ring: KeyRing;

  constructor(config: ConfigService<Env, true>) {
    this.ring = parseKeyRing(config.get('PAYLOAD_ENCRYPTION_KEY', { infer: true }));
  }

  encrypt(plaintext: string): string {
    return encryptPayload(this.ring, plaintext);
  }

  decrypt(stored: string): string {
    return decryptPayload(this.ring, stored);
  }

  hash(plaintext: string): string {
    return hashPayload(plaintext);
  }
}
