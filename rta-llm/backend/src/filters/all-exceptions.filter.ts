import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as string | { message: string | string[] })
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    if (status >= 500) {
      this.logger.error(`HTTP ${status}: ${JSON.stringify(message)}`, exception instanceof Error ? exception.stack : '');
    }

    response.status(status).json({
      statusCode: status,
      message: typeof message === 'object' && message !== null && 'message' in message
        ? (message as { message: string }).message
        : Array.isArray(message)
          ? message.join('; ')
          : message,
      error: HttpStatus[status] || 'Unknown Error',
      timestamp: new Date().toISOString(),
    });
  }
}
