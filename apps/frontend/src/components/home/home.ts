import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { KeycloakService } from '../../app/keycloak/keycloak.service';

@Component({
  selector: 'sh-home',
  imports: [NzButtonModule, NzCardModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent {
  private readonly keycloak = inject(KeycloakService);
  private readonly router = inject(Router);

  get email(): string | null {
    return this.keycloak.userEmail;
  }

  async logout(): Promise<void> {
    await this.keycloak.logout();
    this.router.navigate(['/login']);
  }
}
