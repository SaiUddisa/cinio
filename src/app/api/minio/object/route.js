import { getMinioClient, getObjectContent, listObjectsList } from '@/lib/minio-helper';
import { NextResponse } from 'next/server';

function getMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const mimes = {
    txt: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    ts: 'application/typescript; charset=utf-8',
    jsx: 'text/javascript; charset=utf-8',
    tsx: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    zip: 'application/zip',
    xml: 'application/xml; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    yaml: 'text/yaml; charset=utf-8',
    yml: 'text/yaml; charset=utf-8',
    env: 'text/plain; charset=utf-8',
    conf: 'text/plain; charset=utf-8',
    ini: 'text/plain; charset=utf-8',
  };
  return mimes[ext] || 'application/octet-stream';
}

export async function GET(request) {
  try {
    const client = getMinioClient(request);
    const { searchParams } = new URL(request.url);
    const bucketName = searchParams.get('bucket');
    const objectName = searchParams.get('name');
    const action = searchParams.get('action') || 'view'; // view, download, presigned, read

    if (!bucketName || !objectName) {
      return NextResponse.json({ success: false, error: 'Bucket and name parameters are required' }, { status: 400 });
    }

    if (action === 'presigned') {
      // Generate a download link valid for 24 hours (86400 seconds)
      const url = await client.presignedGetObject(bucketName, objectName, 86400);
      return NextResponse.json({ success: true, url });
    }

    const buffer = await getObjectContent(client, bucketName, objectName);

    if (action === 'read') {
      // Read text content
      const text = buffer.toString('utf-8');
      return NextResponse.json({ success: true, content: text });
    }

    // Default: stream file back
    const mimeType = getMimeType(objectName);
    const fileName = objectName.split('/').pop();
    
    const headers = {
      'Content-Type': mimeType,
      'Content-Length': buffer.length.toString(),
    };

    if (action === 'download') {
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(fileName)}"`;
    } else {
      headers['Content-Disposition'] = `inline; filename="${encodeURIComponent(fileName)}"`;
    }

    return new NextResponse(buffer, { headers });
  } catch (error) {
    console.error('Get object error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const client = getMinioClient(request);
    const contentType = request.headers.get('content-type') || '';

    // Folder creation (JSON)
    if (contentType.includes('application/json')) {
      const { bucketName, folderName, prefix = '' } = await request.json();

      if (!bucketName || !folderName) {
        return NextResponse.json({ success: false, error: 'Bucket and folderName are required' }, { status: 400 });
      }

      // Ensure directory ends with /
      let folderPath = prefix + folderName;
      if (!folderPath.endsWith('/')) {
        folderPath += '/';
      }

      // Put an empty object to simulate a folder
      await client.putObject(bucketName, folderPath, Buffer.alloc(0), 0);
      return NextResponse.json({ success: true, message: `Folder created at ${folderPath}` });
    }

    // File upload (Multipart FormData)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const bucketName = formData.get('bucket');
      const prefix = formData.get('prefix') || ''; // e.g. "folder/"
      const file = formData.get('file');

      if (!bucketName || !file) {
        return NextResponse.json({ success: false, error: 'Bucket and file are required' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const objectName = prefix + file.name;
      const mimeType = file.type || getMimeType(file.name);

      await client.putObject(bucketName, objectName, buffer, buffer.length, {
        'Content-Type': mimeType,
      });

      return NextResponse.json({ 
        success: true, 
        message: `File uploaded successfully: ${objectName}`,
        name: objectName,
        size: buffer.length
      });
    }

    return NextResponse.json({ success: false, error: 'Unsupported Content-Type' }, { status: 400 });
  } catch (error) {
    console.error('Upload / Create folder error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request) {
  try {
    const client = getMinioClient(request);
    const { bucketName, objectName, content } = await request.json();

    if (!bucketName || !objectName || content === undefined) {
      return NextResponse.json({ success: false, error: 'Bucket, objectName, and content are required' }, { status: 400 });
    }

    const buffer = Buffer.from(content, 'utf-8');
    const mimeType = getMimeType(objectName);

    await client.putObject(bucketName, objectName, buffer, buffer.length, {
      'Content-Type': mimeType,
    });

    return NextResponse.json({ success: true, message: `File ${objectName} saved successfully` });
  } catch (error) {
    console.error('Save file error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    const client = getMinioClient(request);
    const { searchParams } = new URL(request.url);
    const bucketName = searchParams.get('bucket');
    const objectName = searchParams.get('name');

    if (!bucketName || !objectName) {
      return NextResponse.json({ success: false, error: 'Bucket and name parameters are required' }, { status: 400 });
    }

    if (objectName.endsWith('/')) {
      // It's a folder: recursively delete all objects with this prefix
      const rawObjects = await listObjectsList(client, bucketName, objectName, true);
      const namesToDelete = rawObjects.map((o) => o.name);

      // Include the folder placeholder itself if not listed
      if (!namesToDelete.includes(objectName)) {
        namesToDelete.push(objectName);
      }

      if (namesToDelete.length > 0) {
        await client.removeObjects(bucketName, namesToDelete);
      }
      
      return NextResponse.json({ 
        success: true, 
        message: `Folder ${objectName} and its ${namesToDelete.length} contents deleted successfully` 
      });
    } else {
      // Delete a single file
      await client.removeObject(bucketName, objectName);
      return NextResponse.json({ success: true, message: `File ${objectName} deleted successfully` });
    }
  } catch (error) {
    console.error('Delete object error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
