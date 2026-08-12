import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);
  private configPath: string;
  private configData: Record<string, any> = {};

  onModuleInit() {
    this.configPath = path.join(os.homedir(), '.agent-reach', 'config.yaml');
    this.loadConfig();
  }

  private loadConfig() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(this.configPath)) {
      try {
        const file = fs.readFileSync(this.configPath, 'utf8');
        this.configData = yaml.load(file) as Record<string, any> || {};
      } catch (e) {
        this.logger.error('Failed to parse config.yaml', e);
        this.configData = {};
      }
    } else {
      fs.writeFileSync(this.configPath, '', { mode: 0o600 });
    }
  }

  get<T = any>(key: string): T | undefined {
    return this.configData[key];
  }

  set(key: string, value: any) {
    this.configData[key] = value;
    fs.writeFileSync(this.configPath, yaml.dump(this.configData), { mode: 0o600 });
  }
}