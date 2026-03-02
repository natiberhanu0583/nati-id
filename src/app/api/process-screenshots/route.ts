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
        const image1 = formData.get('image1');
        const image2 = formData.get('image2');
        const image3 = formData.get('image3');

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

        const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTY0YTkyYTBiYzlhMDlmMjdmYjY0YjkiLCJpYXQiOjE3NzI0Nzg3OTQsImV4cCI6MTc3MzA4MzU5NH0.4XBK7LSYiJwUIquiah9vnwZ_PFHi6TfLBebwV4DE5sI"

        if (!image2 || !image3) {
            return NextResponse.json(
                { message: 'image2 and image3 are mandatory' },
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
                { message: 'Insufficient points. Please add more points to process screenshots.' },
                { status: 402 } // 402 Payment Required
            );
        }

        // Invalidate the points cache
        revalidatePath('/api/points');

        // Create new FormData for external API
        const externalFormData = new FormData();
        if (image1) externalFormData.append('image1', image1);
        externalFormData.append('image2', image2);
        externalFormData.append('image3', image3);

        // Make request to external API
        const response = await axios.post(
            'https://api.affiliate.pro.et/api/v1/process-screenshots',
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

        // Return the response from external API
        return NextResponse.json(response.data, { status: 200 });

    } catch (error: any) {
        console.error('Screenshot proxy error:', error);
        return NextResponse.json(
            {
                message: error.response?.data?.message || 'Failed to process screenshots',
                error: error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json(
        { message: 'Method not allowed' },
        { status: 405 }
    );
}
