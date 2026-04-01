import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    const jwtToken = process.env.API_TOKEN || "";

    if (!file) {
      return NextResponse.json(
        { message: 'File is required' },
        { status: 400 }
      );
    }

    // Create new FormData for external API
    const externalFormData = new FormData();
    externalFormData.append('file', file);

    // Make request to external API (using the same endpoint as process-pdf which handles single file processing)
    try {
      console.log('[API]: Sending image to Affiliate API...');
      const externalResponse = await fetch('https://api.affiliate.pro.et/api/v1/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
        body: externalFormData,
      });

      console.log('Affiliate API response status:', externalResponse.status);
      
      let data: any;
      const contentType = externalResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await externalResponse.json();
      } else {
        const text = await externalResponse.text();
        console.error('Affiliate API returned non-JSON response:', text.substring(0, 200));
        return NextResponse.json(
          { 
            message: `Affiliate API returned error ${externalResponse.status}`, 
            error: 'NON_JSON_RESPONSE',
            details: text.substring(0, 500)
          },
          { status: externalResponse.status }
        );
      }

      if (!externalResponse.ok) {
        console.error('Affiliate API error data:', data);
        return NextResponse.json(
          { message: data.message || 'Affiliate API processing failed', error: data },
          { status: externalResponse.status }
        );
      }
      console.log('Affiliate API success');

      // Return the response from Affiliate API
      return NextResponse.json({
        ...data,
        source: 'affiliate_api'
      }, { status: 200 });

    } catch (fetchError: unknown) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json(
        { message: 'Failed to connect to Affiliate API', error: fetchError instanceof Error ? fetchError.message : 'Unknown network error' },
        { status: 502 }
      );
    }

  } catch (error: unknown) {
    console.error('Internal processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      {
        message: 'Internal server error occurred while processing ID',
        error: errorMessage
      },
      { status: 500 }
    );
  }
}
