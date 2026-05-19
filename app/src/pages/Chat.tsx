import { useNavigate } from 'react-router-dom'
import './Chat.css'

export default function Chat() {
  const navigate = useNavigate()

  return (
    <div className="chat-page">
      <div className="chat-topbar">
        <button className="chat-topbar-btn" onClick={() => navigate(-1)} aria-label="戻る">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15"><polyline points="15 18 9 12 15 6"/></svg>
          戻る
        </button>
        <span className="chat-topbar-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ちょこちゃっとツール
        </span>
        <div className="chat-topbar-spacer" />
        <button className="chat-topbar-btn" onClick={() => navigate('/')} aria-label="ホーム">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          ホーム
        </button>
      </div>
      <div className="chat-frame-wrap">
        <iframe src="/chat.html" title="ちょこちゃっとツール" allow="clipboard-write" />
      </div>
    </div>
  )
}
