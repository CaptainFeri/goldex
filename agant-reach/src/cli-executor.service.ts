import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class CliExecutorService {
  private readonly logger = new Logger(CliExecutorService.name);

  async run(command: string, timeout = 30000): Promise<string> {
    this.logger.debug(`Executing: ${command}`);
    try {
      const { stdout, stderr } = await execAsync(command, {
        shell: '/bin/bash',
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      if (stderr && !stderr.includes('Warning') && !stderr.includes('warning')) {
        this.logger.warn(`Stderr: ${stderr.substring(0, 500)}`);
      }
      return stdout;
    } catch (error: any) {
      this.logger.error(`Command failed: ${command}`, error.stderr?.substring(0, 300));
      throw new Error(`CLI Execution Failed: ${error.message}`);
    }
  }
}