import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  health() {
    return this.appService.getHealth();
  }

  @Get('profile')
  profile(@Req() req: any) {
    return { user: req.user };
  }
}
