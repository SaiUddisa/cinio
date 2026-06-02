import { getMinioClient, listObjectsList } from '@/lib/minio-helper';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const client = getMinioClient(request);
    const { searchParams } = new URL(request.url);
    const bucketName = searchParams.get('bucket');
    const prefix = searchParams.get('prefix') || '';
    const recursive = searchParams.get('recursive') === 'true';

    if (!bucketName) {
      return NextResponse.json({ success: false, error: 'Bucket name is required' }, { status: 400 });
    }

    // Skip explicit bucketExists check for compatibility with permission-restricted credentials.
    // listObjectsV2 will throw an appropriate error if the bucket doesn't exist.

    const rawObjects = await listObjectsList(client, bucketName, prefix, recursive);

    // Format objects for easier rendering
    const items = rawObjects.map((item) => {
      if (item.prefix) {
        // It's a folder
        // The prefix looks like "folder/subfolder/"
        // Leaf name is the last segment before the trailing slash
        const parts = item.prefix.split('/');
        const folderName = parts[parts.length - 2]; // e.g. "Inst_Pre_Tension_v2.pdf"

        // Check if this is a raw MinIO backend disk leak (ends with a standard file extension)
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
          // Treat it as a file!
          return {
            name: item.prefix, // keep prefix with trailing slash
            displayName: folderName, // e.g. "Inst_Pre_Tension_v2.pdf"
            type: 'file',
            size: 0,
            lastModified: null,
            isBackendLeak: true
          };
        }

        const name = folderName + '/';
        return {
          name: item.prefix,
          displayName: name,
          type: 'folder',
          size: 0,
          lastModified: null,
        };
      } else {
        // It's a file
        // The name looks like "folder/file.txt"
        // Leaf name is the last segment
        const parts = item.name.split('/');
        const name = parts[parts.length - 1];
        
        // Skip the folder placeholder itself if it matches the prefix
        if (item.name === prefix) {
          return null;
        }

        return {
          name: item.name,
          displayName: name,
          type: 'file',
          size: item.size,
          lastModified: item.lastModified,
          etag: item.etag,
        };
      }
    }).filter(Boolean);

    return NextResponse.json({ success: true, items, prefix });
  } catch (error) {
    console.error('List objects error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
