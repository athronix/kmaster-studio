// Socket.IO /chat-run 客户端（事件层全局注册一次，按 session_id 在 store 中分发）
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectChatRun(profile?: string): Socket {
  if (!socket) {
    socket = io('/chat-run', {
      transports: ['websocket'],
      query: profile ? { profile } : undefined,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}

export function startRun(req: {
  session_id: string;
  message: string;
  model?: string;
  mode?: string;
  profile?: string;
  instructions?: string;
}) {
  connectChatRun(req.profile).emit('run', req);
}

// F11：注入 /skill <name> 触发语（等价于一条用户消息，由 agent 解析），零协议改动
export function invokeSkill(sessionId: string, name: string) {
  connectChatRun().emit('run', { session_id: sessionId, message: `/skill ${name}` });
}

export function abortRun(sessionId: string) {
  connectChatRun().emit('abort', { session_id: sessionId });
}

export function steerRun(sessionId: string, text: string) {
  connectChatRun().emit('steer', { session_id: sessionId, text });
}

export function respondApproval(sessionId: string, approvalId: string, choice: string) {
  connectChatRun().emit('approval.respond', { session_id: sessionId, approval_id: approvalId, choice });
}

export function respondClarify(sessionId: string, clarifyId: string, response: string) {
  connectChatRun().emit('clarify.respond', { session_id: sessionId, clarify_id: clarifyId, response });
}

export function respondPlan(sessionId: string, planId: string, choice: string) {
  connectChatRun().emit('plan.respond', { session_id: sessionId, plan_id: planId, choice });
}
