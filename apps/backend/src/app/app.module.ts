import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CredentialsModule } from './credentials/credentials.module';
import { MarketplaceCredentialsModule } from './marketplace-credentials/marketplace-credentials.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CredentialsModule,
    PrismaModule,
    MarketplaceCredentialsModule,
  ],
  controllers: [AppController, AuthController],
  providers: [AppService, JwtAuthGuard],
})
export class AppModule {}
