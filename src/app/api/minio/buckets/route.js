import { getMinioClient } from '@/lib/minio-helper';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const client = getMinioClient(request);
    const defaultBucket = request.headers.get('x-minio-default-bucket');

    try {
      const buckets = await client.listBuckets();
      return NextResponse.json({ success: true, buckets });
    } catch (error) {
      // If we got access denied but have a default bucket, return just that bucket
      if (defaultBucket && (error.code === 'AccessDenied' || error.message.includes('Access Denied'))) {
        return NextResponse.json({ 
          success: true, 
          buckets: [{ name: defaultBucket, creationDate: new Date() }] 
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('List buckets error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const client = getMinioClient(request);
    const { bucketName, region = 'us-east-1' } = await request.json();

    if (!bucketName) {
      return NextResponse.json({ success: false, error: 'Bucket name is required' }, { status: 400 });
    }

    // MinIO bucket naming rules check (simplified)
    const isValid = /^[a-z0-9.-]{3,63}$/.test(bucketName);
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid bucket name. Must be lowercase, 3-63 chars, alphanumeric, dots, or dashes.' }, { status: 400 });
    }

    // Check if bucket exists
    const exists = await client.bucketExists(bucketName);
    if (exists) {
      return NextResponse.json({ success: false, error: 'Bucket already exists' }, { status: 400 });
    }

    await client.makeBucket(bucketName, region);
    return NextResponse.json({ success: true, message: `Bucket ${bucketName} created successfully` });
  } catch (error) {
    console.error('Create bucket error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    const client = getMinioClient(request);
    const { searchParams } = new URL(request.url);
    const bucketName = searchParams.get('bucket');

    if (!bucketName) {
      return NextResponse.json({ success: false, error: 'Bucket name is required' }, { status: 400 });
    }

    const exists = await client.bucketExists(bucketName);
    if (!exists) {
      return NextResponse.json({ success: false, error: 'Bucket does not exist' }, { status: 400 });
    }

    await client.removeBucket(bucketName);
    return NextResponse.json({ success: true, message: `Bucket ${bucketName} deleted successfully` });
  } catch (error) {
    console.error('Delete bucket error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
