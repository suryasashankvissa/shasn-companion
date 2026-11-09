import { db, errorResponse } from '@/lib/server';

export const dynamic = 'force-dynamic';

// Published decks available for new games.
export async function GET() {
  try {
    const sb = db();
    const { data: decks, error } = await sb
      .from('decks')
      .select('id,name,description,cover_color,cover_image_url,questions(count)')
      .eq('status', 'published')
      .order('name');
    if (error) throw new Error(error.message);
    return Response.json({
      decks: (decks || []).map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        coverColor: d.cover_color,
        coverImageUrl: d.cover_image_url,
        questionCount: d.questions?.[0]?.count ?? 0,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
