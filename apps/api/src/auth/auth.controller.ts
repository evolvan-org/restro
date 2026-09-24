import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Post, Body , HttpCode, HttpStatus, } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { type LoginResponse, type LoginRequest } from '@rms/api-contract';
import { loginRequestSchema } from '@rms/api-contract';

@ApiTags('authentication')
@Controller('auth') 
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Login user',
        description: 'Authenticates a user using their email and password.',
    })
    login(
        @Body(new ZodValidationPipe(loginRequestSchema))
        body: LoginRequest,
    ): Promise<LoginResponse> { 
        return this.authService.login(body);
    }


} 
