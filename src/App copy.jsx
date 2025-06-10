import React, { useState } from 'react';
import { Upload, X, File } from 'lucide-react';
import 'App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputMessage,
          messages: messages,
          files: uploadedFiles // Include uploaded files in the request
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("AI Response:", data);

      const assistantMessage = {
        role: 'assistant',
        content: data.choices?.[0]?.message?.content || 'Entschuldigung, ich konnte keine Antwort generieren.'
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = {
        role: 'assistant',
        content: 'Entschuldigung, es gab einen Fehler bei der Verarbeitung deiner Nachricht.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        try {
          const content = await file.text();
          const fileData = {
            id: Date.now() + Math.random(), // Simple unique ID
            name: file.name,
            content: content,
            size: file.size,
            uploadedAt: new Date().toLocaleString('de-DE')
          };
          
          setUploadedFiles(prev => [...prev, fileData]);
        } catch (error) {
          console.error('Error reading file:', error);
          alert(`Fehler beim Lesen der Datei ${file.name}`);
        }
      } else {
        alert(`${file.name} ist keine Textdatei. Nur .txt Dateien sind erlaubt.`);
      }
    }
    
    // Reset file input
    event.target.value = '';
  };

  const deleteFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ 
      padding: '2rem', 
      fontFamily: 'Arial, sans-serif',
      maxWidth: '800px',
      margin: '0 auto',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>AI Chatbot</h1>
      
      {/* Chat Messages Container */}
      <div style={{
        flex: 1,
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
        overflowY: 'auto',
        backgroundColor: '#f9f9f9'
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
            Beginne eine Unterhaltung...
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                borderRadius: '8px',
                backgroundColor: message.role === 'user' ? '#007bff' : '#fff',
                color: message.role === 'user' ? 'white' : 'black',
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                border: message.role === 'assistant' ? '1px solid #ddd' : 'none',
                marginLeft: message.role === 'user' ? '20%' : '0',
                marginRight: message.role === 'assistant' ? '20%' : '0'
              }}
            >
              <strong>{message.role === 'user' ? 'Du:' : 'AI:'}</strong>
              <div style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                {message.content}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '8px',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            marginRight: '20%',
            fontStyle: 'italic',
            color: '#666'
          }}>
            AI tippt...
          </div>
        )}
      </div>

      {/* File Upload Section */}
      <div style={{
        marginBottom: '1rem',
        padding: '1rem',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: uploadedFiles.length > 0 ? '1rem' : '0' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#28a745',
            color: 'white',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 'bold'
          }}>
            <Upload size={16} />
            Textdateien hochladen
            <input
              type="file"
              multiple
              accept=".txt,text/plain"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>
            Nur .txt Dateien erlaubt
          </span>
        </div>

        {uploadedFiles.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#333' }}>
              Hochgeladene Dateien ({uploadedFiles.length}):
            </h4>
            <div style={{ 
              maxHeight: '120px', 
              overflowY: 'auto',
              border: '1px solid #eee',
              borderRadius: '4px',
              padding: '0.5rem'
            }}>
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem',
                    marginBottom: '0.25rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <File size={14} color="#666" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis' 
                      }}>
                        {file.name}
                      </div>
                      <div style={{ color: '#666', fontSize: '0.75rem' }}>
                        {formatFileSize(file.size)} • {file.uploadedAt}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteFile(file.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      border: 'none',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      marginLeft: '0.5rem'
                    }}
                    title="Datei löschen"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <textarea
          placeholder="Schreibe deine Nachricht..."
          value={inputMessage}
          onChange={e => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #ddd',
            resize: 'none',
            minHeight: '60px',
            fontFamily: 'Arial, sans-serif'
          }}
          rows={2}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !inputMessage.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: isLoading || !inputMessage.trim() ? '#ccc' : '#007bff',
            color: 'white',
            cursor: isLoading || !inputMessage.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isLoading ? 'Senden...' : 'Senden'}
        </button>
      </div>
    </div>
  );
}

export default App;