import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ success: true, config: null });
    }

    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(fileContent);

    // Validate config has minimal required fields
    if (!config.endpoint || !config.accessKey || !config.secretKey) {
      return NextResponse.json({ success: true, config: null });
    }

    // Assign the special 'default' ID and clean values
    const cleanConfig = {
      id: 'default',
      name: config.name || 'Default MinIO',
      endpoint: config.endpoint,
      port: config.port !== undefined ? String(config.port) : '',
      useSSL: !!config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      defaultBucket: config.defaultBucket || ''
    };

    return NextResponse.json({ success: true, config: cleanConfig });
  } catch (error) {
    console.error('Error reading config.json:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
