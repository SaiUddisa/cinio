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

function resolveActualObjectName(objectName) {
  if (objectName && objectName.endsWith('/')) {
    const parts = objectName.split('/');
    const folderName = parts[parts.length - 2]; // e.g. "Inst_Pre_Tension_v2.pdf"
    const dotIndex = folderName.lastIndexOf('.');
    if (dotIndex !== -1 && dotIndex < folderName.length - 1) {
      const extension = folderName.substring(dotIndex + 1).toLowerCase();
      const commonExtensions = [
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md',
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'mp4', 'webm',
        'ogg', 'mov', 'mp3', 'wav', 'aac', 'zip', 'tar', 'gz', 'json', 'toml',
        'xml', 'html', 'css', 'js', 'py', 'sh', 'go', 'rs'
      ];
      if (commonExtensions.includes(extension)) {
        return objectName + 'part.1';
      }
    }
  }
  return objectName;
}

function extractInlineData(metaBuffer, extension) {
  const magicBytes = {
    pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
    png: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    jpg: Buffer.from([0xFF, 0xD8, 0xFF]),
    jpeg: Buffer.from([0xFF, 0xD8, 0xFF]),
    gif: Buffer.from([0x47, 0x49, 0x46, 0x38]), // GIF8
    zip: Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK..
    mp3: Buffer.from([0x49, 0x44, 0x33]), // ID3
  };

  const magic = magicBytes[extension];
  if (magic) {
    const index = metaBuffer.indexOf(magic);
    if (index !== -1) {
      return metaBuffer.slice(index);
    }
  }

  if (extension === 'mp4') {
    const index = metaBuffer.indexOf(Buffer.from('ftyp'));
    if (index !== -1 && index >= 4) {
      return metaBuffer.slice(index - 4);
    }
  }

  if (extension === 'json') {
    const start = metaBuffer.indexOf(Buffer.from('{'));
    const end = metaBuffer.lastIndexOf(Buffer.from('}'));
    if (start !== -1 && end !== -1 && end > start) {
      return metaBuffer.slice(start, end + 1);
    }
  }
  
  if (extension === 'xml' || extension === 'html') {
    const start = metaBuffer.indexOf(Buffer.from('<'));
    const end = metaBuffer.lastIndexOf(Buffer.from('>'));
    if (start !== -1 && end !== -1 && end > start) {
      return metaBuffer.slice(start, end + 1);
    }
  }

  let textStart = 0;
  for (let i = metaBuffer.length - 1; i >= 0; i--) {
    const char = metaBuffer[i];
    if (char < 32 && char !== 9 && char !== 10 && char !== 13) {
      textStart = i + 1;
      break;
    }
  }
  if (textStart > 8 && textStart < metaBuffer.length) {
    return metaBuffer.slice(textStart);
  }

  return metaBuffer;
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

    const resolvedObjectName = resolveActualObjectName(objectName);

    if (action === 'presigned') {
      // Generate a download link valid for 24 hours (86400 seconds)
      const url = await client.presignedGetObject(bucketName, resolvedObjectName, 86400);
      return NextResponse.json({ success: true, url });
    }

    let buffer;
    try {
      buffer = await getObjectContent(client, bucketName, resolvedObjectName);
    } catch (err) {
      if (err.code === 'NoSuchKey' && resolvedObjectName.endsWith('/part.1')) {
        const xlMetaName = resolvedObjectName.replace(/part\.1$/, 'xl.meta');
        try {
          const metaBuffer = await getObjectContent(client, bucketName, xlMetaName);
          const cleanName = objectName.replace(/\/$/, '');
          const ext = cleanName.split('.').pop().toLowerCase();
          buffer = extractInlineData(metaBuffer, ext);
        } catch (metaErr) {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (action === 'read') {
      // Read text content
      const text = buffer.toString('utf-8');
      return NextResponse.json({ success: true, content: text });
    }

    // Default: stream file back
    const cleanName = objectName.replace(/\/$/, '');
    const mimeType = getMimeType(cleanName);
    
    let fileName = cleanName.split('/').pop();
    if (!fileName && objectName.endsWith('/')) {
      const parts = objectName.split('/').filter(Boolean);
      fileName = parts.pop();
    }
    
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

    const resolvedObjectName = resolveActualObjectName(objectName);
    const buffer = Buffer.from(content, 'utf-8');
    const cleanName = objectName.replace(/\/$/, '');
    const mimeType = getMimeType(cleanName);

    await client.putObject(bucketName, resolvedObjectName, buffer, buffer.length, {
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
