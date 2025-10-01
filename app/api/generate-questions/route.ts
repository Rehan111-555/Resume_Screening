import { NextRequest, NextResponse } from 'next/server';
import { geminiClient } from '@/utils/geminiClient';

export async function POST(request: NextRequest) {
  try {
    const { jobRequirements, topCandidates } = await request.json();

    if (!jobRequirements || !topCandidates) {
      return NextResponse.json(
        { error: 'Job requirements and top candidates are required' },
        { status: 400 }
      );
    }

    const questions = await geminiClient.generateQuestions(jobRequirements, topCandidates);

    return NextResponse.json({ questions });

  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json(
      { error: 'Failed to generate questions' },
      { status: 500 }
    );
  }
}