import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma/client';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schema
const addPointsSchema = z.object({
  email: z.string().email('Invalid email address'),
  points: z.number().int().positive('Points must be a positive integer').max(1000000, 'Points cannot exceed 1,000,000'),
});

export async function POST(request: NextRequest) {
  try {
    // Check if user is admin (you can modify this based on your auth logic)
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (currentUser?.role !== 'ADMIRAL') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Optional: Check if user has admin role
    // const user = await prisma.user.findUnique({
    //   where: { id: session.user.id },
    //   select: { role: true }
    // });

    // if (user?.role !== 'ADMIN') {
    //   return NextResponse.json(
    //     { error: 'Insufficient permissions' },
    //     { status: 403 }
    //   );
    // }

    const body = await request.json();

    // Validate request body
    const validationResult = addPointsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const { email, points } = validationResult.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }



    // Add points to user
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        points: {
          increment: points
        }
      },
      select: {
        id: true,
        email: true,
        points: true,

      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully added ${points} points to ${email}`,
      user: updatedUser
    });

  } catch (error) {
    console.error('Error adding points:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}