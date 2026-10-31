import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { MarketplaceCredentialsService } from './marketplace-credentials.service';

@Module({
  imports: [CredentialsModule],
  providers: [MarketplaceCredentialsService],
  exports: [MarketplaceCredentialsService],
})
export class MarketplaceCredentialsModule {}
