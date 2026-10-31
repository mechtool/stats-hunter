import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';

@Component({
  selector: 'sh-register',
  imports: [RouterModule, NzButtonModule, NzCardModule, NzInputModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterComponent {}
