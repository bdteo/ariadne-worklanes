import { NextResponse, type NextRequest } from 'next/server';
import { WorklaneError, type WorklaneStatus } from '@ariadne-worklanes/core';

import { setDashboardLaneStatus } from '../../../../lib/worklane-data';

export const dynamic = 'force-dynamic';

type StatusRequestBody = {
  status?: string;
  note?: string;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: StatusRequestBody;

  try {
    body = (await request.json()) as StatusRequestBody;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON request body.' }, { status: 400 });
  }

  if (!body.status || typeof body.status !== 'string') {
    return NextResponse.json({ error: 'Missing required status.' }, { status: 400 });
  }

  try {
    const result = await setDashboardLaneStatus(id, body.status as WorklaneStatus, normalizeNote(body.note));
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof WorklaneError && error.message.startsWith('Worklane not found:') ? 404 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

function normalizeNote(note: unknown): string | undefined {
  if (typeof note !== 'string') {
    return undefined;
  }
  const trimmed = note.trim();
  return trimmed || undefined;
}
