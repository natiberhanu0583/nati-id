import { NextResponse } from 'next/server';
import axios from 'axios';
import { PrismaClient } from '@/generated/prisma/client';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { revalidateTag } from 'next/cache';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

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



    const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTY0YTkyYTBiYzlhMDlmMjdmYjY0YjkiLCJpYXQiOjE3NzMxNjI3ODUsImV4cCI6MTc3Mzc2NzU4NX0.sBYNIOPetKwecdp_aCZZLqUkvAsOY-4hK__wHubL0SY"

    if (!file || !userId) {
      return NextResponse.json(
        { message: 'File and userId are required' },
        { status: 400 }
      );
    }

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


    // Create new FormData for external API
    const externalFormData = new FormData();
    externalFormData.append('file', file);

    // Make request to external API
    const response = await axios.post(
      'https://api.affiliate.pro.et/api/v1/process',
      externalFormData,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'multipart/form-data',
        }
      }
    );


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
    // Return the response from external API
    return NextResponse.json(response.data);

  } catch (error: unknown) {
    console.error('Proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorResponse = (error as { response?: { data?: { message?: string }; status?: number } })?.response;

    return NextResponse.json(
      {
        message: errorResponse?.data?.message || 'Failed to process PDF',
        error: errorMessage
      },
      { status: errorResponse?.status || 500 }
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