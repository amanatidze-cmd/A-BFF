import './App.css';
import { useState, useRef, useEffect } from 'react';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Form state
  const [waterType, setWaterType] = useState('fresh-water');
  const [tankSize, setTankSize] = useState('');
  const [habitats, setHabitats] = useState('');
  // Image upload state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null); // base64

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputValue.trim() && !imageFile) return;

    // Validate required fields
    if (!tankSize || !tankSize.trim()) {
      const errorMessage = {
        id: Date.now(),
        text: '⚠️ Please specify the Fish Tank Size (in liters) before asking questions.',
        sender: 'error'
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Add user message to chat
    const userMessage = { id: Date.now(), text: inputValue, sender: 'user', imageUrl: imagePreview || null };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setImageFile(null);
    setImagePreview(null);
    setImageData(null);
    setLoading(true);

    try {
      // Use Vite's dev proxy (routes to http://localhost:5001 internally)
      const endpoint = '/api/chat';
      
      console.debug('Endpoint:', endpoint);
      
      const payload = {
        message: inputValue,
        image: imageData || null,
        metadata: { waterType, tankSize, habitats },
        fields: [
          { name: 'waterType', value: waterType },
          { name: 'tankSize', value: tankSize },
          { name: 'habitats', value: habitats }
        ]
      };

      const API_KEY = import.meta.env.API_KEY || '';
      const GUID = import.meta.env.GUID || 'ff8f6e97-59ef-42de-b029-6030ae9bd482';

      const headers = {
        'Content-Type': 'application/json',
      };
      if (API_KEY) {
        headers['Authorization'] = `Bearer ${API_KEY}`;
        headers['X-API-Key'] = API_KEY;
      }
      headers['X-GUID'] = GUID;

      console.debug('Sending API request to', endpoint, 'payload:', { message: inputValue, hasImage: !!imageData, fields: payload.fields });
      console.debug('Request headers:', headers);

      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers,
        body: JSON.stringify(payload),
      }).catch(err => {
        console.error('Fetch network error:', err.message);
        throw err;
      });
      let responseText = null;
      try {
        responseText = await response.text();
      } catch (err) {
        console.error('Failed to read response text', err);
      }

      if (!response.ok) {
        let parsed = responseText;
        try {
          parsed = JSON.parse(responseText);
        } catch (e) {
          // keep as text
        }
        console.error('API responded with error', { status: response.status, statusText: response.statusText, body: parsed });

        // Show friendly error to user and include executionId when available
        const serverMessage = parsed && parsed.error ? parsed.error : `API error ${response.status}: ${response.statusText}`;
        const executionId = parsed && parsed.executionId ? parsed.executionId : null;
        const display = executionId ? `${serverMessage} (executionId: ${executionId})` : serverMessage;

        const errorMessage = {
          id: Date.now() + 1,
          text: display,
          sender: 'error'
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }

      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (err) {
        data = { reply: responseText };
      }
      
      console.log('API Response data:', data);
      
      const aiMessage = {
        id: Date.now() + 1,
        text: data.reply || 'No response received',
        sender: 'ai',
        imageUrl: data.imageUrl || null
      };
      
      if (!data.reply) {
        console.warn('API response did not contain a reply field. Response object:', data);
      }
      
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Full error details:', {
        message: error.message,
        cause: error.cause,
        stack: error.stack,
        type: error.name
      });
      
      // Extract meaningful error message
      let errorText = error.message || 'Unable to get response.';
      if (errorText.includes('400')) {
        errorText = '❌ Invalid request. Check the form fields and try again.';
      } else if (errorText.includes('401')) {
        errorText = '🔑 Authentication failed. Check your API credentials.';
      } else if (errorText.includes('500')) {
        errorText = '⚠️ Server error. The AI service is having issues. Please try again later.';
      } else if (errorText.includes('Load failed')) {
        errorText = '🌐 Network error. Unable to reach the service.';
      }
      
      const errorMessage = {
        id: Date.now() + 1,
        text: errorText,
        sender: 'error'
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      setImagePreview(base64);
      setImageData(base64);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageData(null);
  };

  return (
    <div className="App">
      <div className="main-container">
        {/* Left Panel - Form */}
        <div className="form-panel">
          <div className="form-header">
            <h2>Fish Tank Setup</h2>
            <p className="form-subtitle">Leave empty habitats if you only consider to buy new one</p>
          </div>

          <div className="form-content">
            {/* Water Type Toggle */}
            <div className="form-group">
              <label className="form-label">Water Type</label>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${waterType === 'fresh-water' ? 'active' : ''}`}
                  onClick={() => setWaterType('fresh-water')}
                >
                  Fresh Water
                </button>
                <button
                  className={`toggle-btn ${waterType === 'salt-water' ? 'active' : ''}`}
                  onClick={() => setWaterType('salt-water')}
                >
                  Salt Water
                </button>
              </div>
            </div>

            {/* Tank Size */}
            <div className="form-group">
              <label htmlFor="tankSize" className="form-label">
                Fish Tank Size (Liters)
              </label>
              <input
                id="tankSize"
                type="number"
                value={tankSize}
                onChange={(e) => setTankSize(e.target.value)}
                placeholder="Enter tank size in liters"
                className="form-input"
              />
            </div>

            {/* Habitats */}
            <div className="form-group">
              <label htmlFor="habitats" className="form-label">
                Habitats
              </label>
              <p className="form-hint">Example: 1 betta, 1 neretina snail</p>
              <textarea
                id="habitats"
                value={habitats}
                onChange={(e) => setHabitats(e.target.value)}
                placeholder="Describe your fish tank inhabitants..."
                className="form-textarea"
              />
            </div>
          </div>
        </div>

        {/* Right Panel - Chatbot */}
        <div className="chat-panel">
          <div className="chat-container">
            <div className="chat-header">
              <img src="/logo.jpg" alt="Logo" className="chat-logo" />
              <div className="chat-header-text">
                <h1>AI Chat Assistant</h1>
                <p className="chat-subtitle">Ask about your fish tank</p>
              </div>
            </div>

            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <p>👋 Ask best fish friend anything about your fish tank</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`message ${msg.sender}`}
                  >
                    <div className={`message-bubble ${msg.sender}`}>
                      {msg.text}
                      {msg.imageUrl && (
                        <div className="message-image">
                          <img src={msg.imageUrl} alt="uploaded" />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="message ai">
                  <div className="message-bubble ai typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={sendMessage}>
              <div className="image-input-row">
                <input
                  id="imageInput"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={loading}
                  className="image-input"
                />
                {imagePreview && (
                  <div className="image-preview">
                    <img src={imagePreview} alt="preview" />
                    <button type="button" className="remove-image" onClick={removeImage}>Remove</button>
                  </div>
                )}
              </div>

              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message..."
                disabled={loading}
                className="chat-input"
              />
              <button 
                type="submit" 
                disabled={loading || (!inputValue.trim() && !imageFile)}
                className="send-button"
              >
                {loading ? '...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
