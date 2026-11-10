import { NextResponse } from "next/server"
import { ZodError } from "zod"

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status })
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) return jsonError(error.message, error.status)
  if (error instanceof ZodError) return jsonError(error.issues[0]?.message || "参数不正确", 400)
  console.error(error)
  return jsonError("服务器开小差了，请稍后再试", 500)
}

export async function readJson(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, "请求格式不正确")
  }
}
