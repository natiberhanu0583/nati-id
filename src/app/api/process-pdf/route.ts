import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    /*
    const session = await auth.api.getSession({
      headers: request.headers
    });
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    */
    const userId = 'GUEST_USER';

    const jwtToken = process.env.API_TOKEN || ""

    if (!file || !userId) {
      return NextResponse.json(
        { message: 'File and userId are required' },
        { status: 400 }
      );
    }

    /* Skip point check for now
    // Check user points
    const user = await prisma.user.findUnique({
      where: { id: userId.toString() },
      select: { points: true }
    });

    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    if (user.points < 1) {
      return NextResponse.json(
        { message: 'Insufficient points. Please add more points to process PDF.' },
        { status: 402 } // 402 Payment Required
      );
    }


    // Invalidate the points cache
    revalidatePath('/api/points');
    */


    // Create new FormData for external API
    const externalFormData = new FormData();
    externalFormData.append('file', file);

    // Make request to external API
    try {
      console.log('Sending PDF to external API...');
      const externalResponse = await fetch('https://api.affiliate.pro.et/api/v1/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
        body: externalFormData,
      });

      console.log('External API response status:', externalResponse.status);
      const data = await externalResponse.json();

      if (!externalResponse.ok) {
        console.error('External API error data:', data);
        return NextResponse.json(
          { message: data.message || 'External PDF processing failed', error: data },
          { status: externalResponse.status }
        );
      }
      console.log('External API success');

      /*
      // Deduct 1 point from user
      await prisma.user.update({
        where: { id: userId.toString() },
        data: {
          points: {
            decrement: 1
          }
        }
      });

      // Revalidate with tag
      revalidateTag(`user-points-${userId}`, 'default');
      */
      // Return the response from external API
      return NextResponse.json(data, { status: 200 });

    } catch (fetchError: unknown) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json(
        { message: 'Failed to connect to external processing API', error: fetchError instanceof Error ? fetchError.message : 'Unknown network error' },
        { status: 502 }
      );
    }

  } catch (error: unknown) {
    console.error('PDF proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      {
        message: 'Internal server error occurred while processing PDF',
        error: errorMessage
      },
      { status: 500 }
    );
  }
}

// Optional: Add other HTTP methods if needed
export async function GET() {
  return NextResponse.json(
    { message: 'Method not allowed' },
    { status: 405 }
  );
}