import { Global, Module } from '@nestjs/common';
import { PayloadCryptoService } from './payload-crypto.service';

/** Global: stock import, checkout delivery and the vault endpoint all encrypt/decrypt. */
@Global()
@Module({
  providers: [PayloadCryptoService],
  exports: [PayloadCryptoService],
})
export class CryptoModule {}
