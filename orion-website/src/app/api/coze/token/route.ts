import { NextResponse } from 'next/server';

const FALLBACK_TOKEN = 'pat_PByekcjM9p6d6Ti5Xjqt7LWs8CXRiU3Ot73ylZhZh79FDycMebAYDpmximltijmW';

export async function GET() {
  const token = process.env.COZE_PAT || FALLBACK_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: 'Token not configured' },
      { status: 500 }
    );
  }

  return NextResponse.json({ token });
}
