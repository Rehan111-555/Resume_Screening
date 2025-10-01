// app/api/generate-questions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateQuestions } from '@/utils/geminiClient.server'; // <-- match your filename

export async function POST(request: NextRequest) {
  try {
    const { jobRequirements, topCandidates } = await request.json();
    if (!jobRequirements || !topCandidates) {
      return NextResponse.json({ error: 'Job requirements and top candidates are required' }, { status: 400 });
    }

    const questions = await generateQuestions(jobRequirements, topCandidates); // <-- call the function directly
    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}

