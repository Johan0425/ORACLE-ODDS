import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('favorites/teams')
  favoriteTeams(@CurrentUserId() userId: string) {
    return this.usersService.favoriteTeams(userId);
  }

  @Post('favorites/teams/:teamId')
  addFavoriteTeam(@CurrentUserId() userId: string, @Param('teamId') teamId: string) {
    return this.usersService.addFavoriteTeam(userId, teamId);
  }

  @Delete('favorites/teams/:teamId')
  removeFavoriteTeam(@CurrentUserId() userId: string, @Param('teamId') teamId: string) {
    return this.usersService.removeFavoriteTeam(userId, teamId);
  }

  @Get('favorites/leagues')
  favoriteLeagues(@CurrentUserId() userId: string) {
    return this.usersService.favoriteLeagues(userId);
  }

  @Post('favorites/leagues/:leagueId')
  addFavoriteLeague(@CurrentUserId() userId: string, @Param('leagueId') leagueId: string) {
    return this.usersService.addFavoriteLeague(userId, leagueId);
  }

  @Delete('favorites/leagues/:leagueId')
  removeFavoriteLeague(@CurrentUserId() userId: string, @Param('leagueId') leagueId: string) {
    return this.usersService.removeFavoriteLeague(userId, leagueId);
  }

  @Get('history')
  history(@CurrentUserId() userId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.usersService.history(userId, Number(page), Number(limit));
  }

  @Post('history')
  recordView(@CurrentUserId() userId: string, @Body('fixtureId') fixtureId: string) {
    return this.usersService.recordView(userId, fixtureId);
  }
}
