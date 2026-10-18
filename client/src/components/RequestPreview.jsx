export default function RequestPreview({ requests }) {

  if (!requests || requests.length === 0) {
    return (
      <div className="request-preview">
        <h2>Requests</h2>
        <p>No pending requests</p>
      </div>
    );
  }

  return (
    <div className="request-preview">
      <h2>Message Requests</h2>

      {requests.map(r => (
        <div key={r.id} className="request-preview-card">
          <img src={r.avatar} />
          <div>
            <b>{r.name}</b>
            <p>Wants to start a conversation</p>
          </div>
        </div>
      ))}
    </div>
  );
}