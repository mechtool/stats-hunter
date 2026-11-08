import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { KeycloakAdminService } from './auth/keycloak-admin.service';
import { KeycloakTokenService } from './auth/keycloak-token.service';
import { RateLimitGuard } from './auth/rate-limit.guard';
import { SessionController } from './auth/session.controller';
import { SessionService } from './auth/session.service';
import { CredentialsModule } from './credentials/credentials.module';
import { MailModule } from './mail/mail.module';
import { MarketplaceCredentialsModule } from './marketplace-credentials/marketplace-credentials.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CredentialsModule,
    MailModule,
    PrismaModule,
    MarketplaceCredentialsModule,
  ],
  controllers: [AppController, AuthController, SessionController],
  providers: [
    AppService,
    RateLimitGuard,
    SessionService,
    KeycloakTokenService,
    KeycloakAdminService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
