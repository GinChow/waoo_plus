import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { uploadProjectAssetToGlobal } from '@/lib/assets/services/asset-actions'

type UploadToGlobalBody = {
  kind?: 'character' | 'location'
  projectId?: string
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) => {
  const { assetId } = await context.params
  const body = await request.json() as UploadToGlobalBody

  if (!body.projectId || (body.kind !== 'character' && body.kind !== 'location')) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = await requireProjectAuthLight(body.projectId)
  if (isErrorResponse(authResult)) return authResult

  const result = await uploadProjectAssetToGlobal({
    kind: body.kind,
    targetId: assetId,
    access: {
      userId: authResult.session.user.id,
      projectId: body.projectId,
    },
  })

  return NextResponse.json(result)
})
