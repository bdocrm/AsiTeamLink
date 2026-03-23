import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEnvHealth } from '@/lib/envCheck';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const BUCKET_NAME = 'attachments';

const ALLOWED_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain', 'text/csv',
  // Archives
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  // Video
  'video/mp4', 'video/webm',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg',
];

export async function POST(request: NextRequest) {
  // Log environment health for easier debugging (prints SET/MISSING, not secrets)
  logEnvHealth();
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log('Upload request file:', { name: file.name, size: file.size, type: file.type });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 5MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type "${file.type}" is not allowed.` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Ensure bucket exists
    let bucketsList;
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      bucketsList = buckets;
    } catch (err) {
      console.error('Error listing buckets:', err);
      return NextResponse.json({ error: 'Storage listBuckets failed.', detail: String(err) }, { status: 500 });
    }

    const bucketExists = bucketsList?.some((b: any) => b.name === BUCKET_NAME);

    if (!bucketExists) {
      try {
        const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: MAX_FILE_SIZE,
          allowedMimeTypes: ALLOWED_TYPES,
        });
        if (createError) {
          console.error('Bucket creation error:', createError);
          return NextResponse.json({ error: 'Failed to initialize storage.', detail: String(createError) }, { status: 500 });
        }
      } catch (err) {
        console.error('Create bucket threw:', err);
        return NextResponse.json({ error: 'Create bucket threw error.', detail: String(err) }, { status: 500 });
      }
    }

    // Generate unique filename: timestamp-random-originalname
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const filePath = `${timestamp}-${random}-${sanitizedName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return NextResponse.json({ error: 'Failed to upload file.', detail: String(uploadError) }, { status: 500 });
      }
    } catch (err) {
      console.error('Upload threw error:', err);
      return NextResponse.json({ error: 'Upload threw error.', detail: String(err) }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      console.error('No public URL returned for uploaded file', { filePath, urlData });
      return NextResponse.json({ error: 'No public URL for uploaded file.', detail: JSON.stringify(urlData) }, { status: 500 });
    }

    return NextResponse.json({
      url: urlData.publicUrl,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Upload handler error:', error);
    return NextResponse.json({ error: 'Upload failed.', detail: String(error) }, { status: 500 });
  }
}
