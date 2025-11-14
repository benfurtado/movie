'use client';

import { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

interface ChatProps {
  ws: WebSocket | null;
  currentUserId: string;
  currentUserName: string;
}

export default function Chat({ ws, currentUserId, currentUserName }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'chat') {
        setMessages((prev) => [...prev, {
          userId: message.userId,
          userName: message.userName,
          text: message.text,
          timestamp: message.timestamp
        }]);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'chat',
      text: input.trim()
    }));

    setInput('');
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 sm:w-14 sm:h-14 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-white hover:bg-zinc-800 active:bg-zinc-700 transition-all shadow-lg touch-manipulation"
      >
        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-white text-black text-[10px] sm:text-xs font-bold rounded-full flex items-center justify-center">
            {messages.length > 99 ? '99+' : messages.length}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col h-[400px] sm:h-[500px]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h3 className="text-white font-semibold text-lg">Chat</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm mt-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.userId === currentUserId ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-2 ${
                      msg.userId === currentUserId
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-white'
                    }`}
                  >
                    {msg.userId !== currentUserId && (
                      <div className="text-xs font-medium text-gray-400 mb-1">
                        {msg.userName}
                      </div>
                    )}
                    <div className="text-sm">{msg.text}</div>
                    <div className={`text-xs mt-1 ${
                      msg.userId === currentUserId ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-4 border-t border-zinc-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 bg-black border border-zinc-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zinc-700 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

