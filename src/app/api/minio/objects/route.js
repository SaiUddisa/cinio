import { getMinioClient } from '@/lib/minio-helper';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const client = getMinioClient(request);
    const { searchParams } = new URL(request.url);
    const bucketName = searchParams.get('bucket');
    const prefix = searchParams.get('prefix') || '';
    const recursive = searchParams.get('recursive') === 'true';
    
    // Server-side pagination & search parameters
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || '';

    if (!bucketName) {
      return NextResponse.json({ success: false, error: 'Bucket name is required' }, { status: 400 });
    }

    const items = [];
    let totalCount = 0;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // Use listObjectsV2 to stream the items from MinIO
    const stream = client.listObjectsV2(bucketName, prefix, recursive);

    await new Promise((resolve, reject) => {
      stream.on('data', (item) => {
        let formatted = null;
        if (item.prefix) {
          // Folder
          const parts = item.prefix.split('/');
          const folderName = parts[parts.length - 2];
          
          // Check for backend leak
          const dotIndex = folderName.lastIndexOf('.');
          const hasExtension = dotIndex !== -1 && dotIndex < folderName.length - 1;
          const extension = hasExtension ? folderName.substring(dotIndex + 1).toLowerCase() : '';
          const commonExtensions = [
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md',
            'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'mp4', 'webm',
            'ogg', 'mov', 'mp3', 'wav', 'aac', 'zip', 'tar', 'gz', 'json', 'toml',
            'xml', 'html', 'css', 'js', 'py', 'sh', 'go', 'rs'
          ];

          if (hasExtension && commonExtensions.includes(extension)) {
            formatted = {
              name: item.prefix,
              displayName: folderName,
              type: 'file',
              size: 0,
              lastModified: null,
              isBackendLeak: true
            };
          } else {
            const name = folderName + '/';
            formatted = {
              name: item.prefix,
              displayName: name,
              type: 'folder',
              size: 0,
              lastModified: null,
            };
          }
        } else {
          // File
          const parts = item.name.split('/');
          const name = parts[parts.length - 1];
          
          if (item.name !== prefix) {
            formatted = {
              name: item.name,
              displayName: name,
              type: 'file',
              size: item.size,
              lastModified: item.lastModified,
              etag: item.etag,
            };
          }
        }

        if (formatted) {
          // Filter by search query if provided
          const matchesSearch = !search || formatted.displayName.toLowerCase().includes(search.toLowerCase());
          if (matchesSearch) {
            if (totalCount >= startIndex && totalCount < endIndex) {
              items.push(formatted);
            }
            totalCount++;
          }
        }
      });

      stream.on('error', (err) => {
        reject(err);
      });

      stream.on('end', () => {
        resolve();
      });
    });

    return NextResponse.json({ 
      success: true, 
      items, 
      prefix, 
      total: totalCount,
      page,
      limit
    });
  } catch (error) {
    console.error('List objects error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
