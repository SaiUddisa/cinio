import { getMinioClient } from '@/lib/minio-helper';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const client = getMinioClient(request);
    
    // Extract default bucket header
    const defaultBucket = request.headers.get('x-minio-default-bucket');
    
    if (defaultBucket) {
      // If default bucket is specified, check its existence to test connection
      const exists = await client.bucketExists(defaultBucket);
      return NextResponse.json({ 
        success: true, 
        count: exists ? 1 : 0, 
        isRestricted: true 
      });
    }

    try {
      const buckets = await client.listBuckets();
      return NextResponse.json({ success: true, count: buckets.length, isRestricted: false });
    } catch (listError) {
      // If listing fails due to permissions, warn the user to specify a default bucket
      if (listError.code === 'AccessDenied' || listError.message.includes('Access Denied')) {
        return NextResponse.json({ 
          success: false, 
          error: "Access Denied. Your credentials may have restricted permissions. Please specify a 'Default Bucket' (e.g. 'nupat') in the profile configurations."
        }, { status: 403 });
      }
      throw listError;
    }
  } catch (error) {
    console.error('Test connection error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
