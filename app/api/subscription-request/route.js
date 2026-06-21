

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();

    const { user_email, username, plan_name, category, price } = body;

    const { error } = await supabase
      .from('subscription_requests')
      .insert([
        {
          user_email,
          username,
          plan_name,
          category,
          price,
          status: 'pending'
        }
      ]);

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال طلب الاشتراك بنجاح'
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}