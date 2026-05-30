import * as Minio from 'minio';

export function getMinioClient(request) {
  const headers = request.headers;
  let endpoint = headers.get('x-minio-endpoint');
  let portHeader = headers.get('x-minio-port');
  let useSSL = headers.get('x-minio-use-ssl') === 'true';
  let accessKey = headers.get('x-minio-access-key');
  let secretKey = headers.get('x-minio-secret-key');

  // Fallback to query parameters if headers are not present
  if (!endpoint || !accessKey || !secretKey) {
    const { searchParams } = new URL(request.url);
    endpoint = searchParams.get('endpoint') || searchParams.get('x-minio-endpoint');
    portHeader = searchParams.get('port') || searchParams.get('x-minio-port');
    useSSL = (searchParams.get('useSSL') || searchParams.get('x-minio-use-ssl')) === 'true';
    accessKey = searchParams.get('accessKey') || searchParams.get('x-minio-access-key');
    secretKey = searchParams.get('secretKey') || searchParams.get('x-minio-secret-key');
  }

  if (!endpoint || !accessKey || !secretKey) {
    throw new Error('Missing MinIO configuration headers or query parameters');
  }

  // Remove http:// or https:// from endpoint if present
  endpoint = endpoint.replace(/^(http:\/\/|https:\/\/)/, '');

  const clientConfig = {
    endPoint: endpoint,
    useSSL: useSSL,
    accessKey: accessKey,
    secretKey: secretKey,
    pathStyle: true,
  };

  if (portHeader) {
    const parsedPort = parseInt(portHeader, 10);
    if (!isNaN(parsedPort)) {
      clientConfig.port = parsedPort;
    }
  } else {
    // Auto-extract port if endpoint has a colon
    if (endpoint.includes(':')) {
      const parts = endpoint.split(':');
      clientConfig.endPoint = parts[0];
      const parsedPort = parseInt(parts[1], 10);
      if (!isNaN(parsedPort)) {
        clientConfig.port = parsedPort;
      }
    }
  }


  return new Minio.Client(clientConfig);
}

// Wrap object listing stream in a promise
export function listObjectsList(client, bucketName, prefix = '', recursive = false) {
  return new Promise((resolve, reject) => {
    try {
      const objects = [];
      const stream = client.listObjectsV2(bucketName, prefix, recursive);
      
      stream.on('data', (obj) => {
        objects.push(obj);
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
      
      stream.on('end', () => {
        resolve(objects);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Wrap object retrieval stream in a promise
export function getObjectContent(client, bucketName, objectName) {
  return new Promise((resolve, reject) => {
    client.getObject(bucketName, objectName, (err, dataStream) => {
      if (err) {
        return reject(err);
      }
      
      const chunks = [];
      dataStream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      dataStream.on('error', (err) => {
        reject(err);
      });
      
      dataStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  });
}
