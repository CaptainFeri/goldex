import { Injectable } from '@nestjs/common';

export interface ProviderStatus {
  name: string;
  category: string;
  status: 'connected' | 'disconnected' | 'connecting';
  trackedItems: number;
  lastUpdate?: Date;
}

@Injectable()
export class ConsoleFormatterService {

  // ANSI color codes
  private readonly colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
  };

  printHeader() {
    console.log('\n' + this.colors.cyan + '═'.repeat(80) + this.colors.reset);
    console.log(
      this.colors.bright +
        this.colors.white +
        '  🚀 PRICE ENGINE REAL-TIME MONITOR  ' +
        this.colors.reset,
    );
    console.log(this.colors.cyan + '═'.repeat(80) + this.colors.reset + '\n');
  }

  printProvidersTable(providers: ProviderStatus[]) {
    console.log(
      this.colors.bright + this.colors.yellow + '📊 PROVIDERS STATUS' + this.colors.reset,
    );
    console.log(this.colors.dim + '─'.repeat(80) + this.colors.reset);

    const rows = providers.map((p) => ({
      Provider: this.formatProviderName(p.name, p.category),
      Category: this.formatCategory(p.category),
      Status: this.formatStatus(p.status),
      'Tracked Items': p.trackedItems.toString(),
      'Last Update': p.lastUpdate ? this.formatTime(p.lastUpdate) : '—',
    }));

    console.table(rows);
    console.log(this.colors.dim + '─'.repeat(80) + this.colors.reset + '\n');
  }

  printPriceUpdate(providerName: string, processed: number, total: number, items?: any[]) {
    const percentage = ((processed / total) * 100).toFixed(1);
    let bar = '';
    const barLength = 20;
    const filled = Math.floor((processed / total) * barLength);
    for (let i = 0; i < barLength; i++) {
      bar += i < filled ? '█' : '░';
    }

    const color = processed === total ? this.colors.green : this.colors.cyan;
    const symbol = processed === total ? '✅' : '🔄';

    console.log(
      `${symbol} ${this.colors.bright}${providerName}${this.colors.reset} ` +
        `${color}[${bar}]${this.colors.reset} ` +
        `${this.colors.bright}${processed}/${total}${this.colors.reset} items ` +
        `(${percentage}%) ${this.formatTime(new Date())}`,
    );

    // If we have items, show top 3 changes
    if (items && items.length > 0 && processed <= total) {
      const topItems = items.slice(0, 3);
      for (const item of topItems) {
        console.log(
          `   📦 ${this.colors.white}${item.name || `Item ${item.itemId}`}${this.colors.reset} ` +
            `💰 Buy: ${this.formatPrice(item.buyPrice)} | ` +
            `💸 Sell: ${this.formatPrice(item.sellPrice)} | ` +
            `${item.canBuy ? '🟢' : '🔴'} ${item.canSell ? '🟢' : '🔴'}`,
        );
      }
      if (items.length > 3) {
        console.log(`   ${this.colors.dim}... and ${items.length - 3} more${this.colors.reset}`);
      }
    }
  }

  printConnectionEvent(
    providerName: string,
    event: 'connected' | 'disconnected' | 'reconnecting' | 'connecting',
    details?: any,
  ) {
    const timestamp = this.formatTime(new Date());
    let icon = '🔌';
    let color = this.colors.green;
    let message = '';

    switch (event) {
      case 'connected':
        icon = '✅';
        color = this.colors.green;
        message = `Connected successfully`;
        break;
      case 'disconnected':
        icon = '❌';
        color = this.colors.red;
        message = `Disconnected`;
        break;
      case 'connecting':
        icon = '🔄';
        color = this.colors.cyan;
        message = `Connecting...`;
        break;
      case 'reconnecting':
        icon = '🔄';
        color = this.colors.yellow;
        message = `Reconnecting (attempt ${details?.attempt || 1})`;
        break;
    }

    console.log(
      `${icon} ${color}[${timestamp}]${this.colors.reset} ${this.colors.bright}${providerName}${this.colors.reset} ${message}`,
    );
  }

  printMetadataLoaded(providerName: string, itemCount: number, categories: Record<string, number>) {
    console.log(
      `📚 ${this.colors.bright}${providerName}${this.colors.reset} loaded ${this.colors.green}${itemCount}${this.colors.reset} items:`,
    );
    for (const [category, count] of Object.entries(categories)) {
      console.log(`   ${this.colors.cyan}▸${this.colors.reset} ${category}: ${count} items`);
    }
  }

  printSystemStats(stats: any) {
    console.log('\n' + this.colors.dim + '─'.repeat(80) + this.colors.reset);
    console.log(this.colors.bright + this.colors.blue + '📈 SYSTEM STATISTICS' + this.colors.reset);
    console.log(
      `   Total Items: ${this.colors.bright}${stats.totalItems || 0}${this.colors.reset} | ` +
        `Active Trades: ${stats.activeTrades || 0} | ` +
        `Total Records: ${stats.totalRecords || 0}`,
    );
    if (stats.lastUpdate) {
      console.log(`   Last Update: ${this.formatTime(new Date(stats.lastUpdate))}`);
    }
    console.log(this.colors.dim + '─'.repeat(80) + this.colors.reset);
  }

  log(provider: string, message: string) {
    console.log(
      `${this.colors.blue}[${this.formatTime(new Date())}]${this.colors.reset} ${this.colors.bright}${provider}${this.colors.reset} ${message}`,
    );
  }

  warn(provider: string, message: string) {
    console.warn(
      `${this.colors.yellow}[${this.formatTime(new Date())}]${this.colors.reset} ${this.colors.bright}${provider}${this.colors.reset} ${this.colors.yellow}${message}${this.colors.reset}`,
    );
  }

  error(provider: string, message: string) {
    console.error(
      `${this.colors.red}[${this.formatTime(new Date())}]${this.colors.reset} ${this.colors.bright}${provider}${this.colors.reset} ${this.colors.red}${message}${this.colors.reset}`,
    );
  }

  debug(provider: string, message: string) {
    console.debug(
      `${this.colors.dim}[${this.formatTime(new Date())}]${this.colors.reset} ${provider} ${this.colors.dim}${message}${this.colors.reset}`,
    );
  }

  printProviderReport(providerName: string, category: string, itemsCount: number, status: string) {
    const icon = status === 'connected' ? '✅' : status === 'connecting' ? '🔄' : '❌';
    const statusColor = status === 'connected' ? this.colors.green : status === 'connecting' ? this.colors.yellow : this.colors.red;
    const catColor = category === 'zaryar' ? this.colors.magenta : this.colors.cyan;
    console.log(
      `${icon} ${catColor}[${category.toUpperCase()}]${this.colors.reset} ${this.colors.bright}${providerName}${this.colors.reset} ` +
        `${statusColor}${status.toUpperCase()}${this.colors.reset} | ` +
        `Items: ${this.colors.bright}${itemsCount}${this.colors.reset}`,
    );
  }

  printDivider(char = '\u2500') {
    console.log(this.colors.dim + char.repeat(80) + this.colors.reset);
  }

  private formatProviderName(name: string, category: string): string {
    const categoryColor = category === 'zaryar' ? this.colors.magenta : this.colors.cyan;
    return `${categoryColor}[${category.toUpperCase()}]${this.colors.reset} ${this.colors.bright}${name}${this.colors.reset}`;
  }

  private formatCategory(category: string): string {
    return category === 'zaryar' ? '🔷 Zaryar' : '🔶 TalaAb';
  }

  private formatStatus(status: string): string {
    switch (status) {
      case 'connected':
        return `${this.colors.green}● CONNECTED${this.colors.reset}`;
      case 'disconnected':
        return `${this.colors.red}● DISCONNECTED${this.colors.reset}`;
      default:
        return `${this.colors.yellow}● CONNECTING${this.colors.reset}`;
    }
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US').format(price) + ' تومان';
  }
}
