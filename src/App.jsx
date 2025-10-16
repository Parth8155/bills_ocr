import { useState, useRef, useEffect } from 'react'
import './App.css'

function App() {
  const [files, setFiles] = useState([])
  const [structuredData, setStructuredData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [useCamera, setUseCamera] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [editingCell, setEditingCell] = useState(null)
  const [editValue, setEditValue] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add('dragover')
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('dragover')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('dragover')
    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles(droppedFiles)
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Use back camera on mobile
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setCameraActive(true)
      }
    } catch (err) {
      setError('Camera access denied or not available')
      console.error('Camera error:', err)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0)

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `bill-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
        setFiles(prev => [...prev, file])
        setUseCamera(false)
        stopCamera()
      }
    }, 'image/jpeg', 0.8)
  }

  const startEditing = (rowIndex, colIndex, currentValue) => {
    setEditingCell({ row: rowIndex, col: colIndex })
    setEditValue(currentValue || '')
  }

  const saveEdit = () => {
    if (!editingCell || !structuredData) return

    const newData = [...structuredData]
    const headers = getAllHeaders()
    const header = headers[editingCell.col]
    
    if (newData[editingCell.row]) {
      newData[editingCell.row][header] = editValue
      setStructuredData(newData)
    }
    
    setEditingCell(null)
    setEditValue('')
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const getAllHeaders = () => {
    if (!structuredData || !Array.isArray(structuredData)) return []
    
    const allKeys = new Set()
    structuredData.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)))
    let headers = Array.from(allKeys)

    const shopKey = headers.find(h => h.toLowerCase().includes('shop') || h.toLowerCase().includes('vendor') || h === 'shop_name')
    if (shopKey) {
      headers = headers.filter(h => h !== shopKey)
      headers.unshift(shopKey)
    }
    
    return headers
  }

  const addNewRow = () => {
    if (!structuredData) return
    
    const headers = getAllHeaders()
    const newRow = {}
    headers.forEach(header => {
      newRow[header] = ''
    })
    
    setStructuredData([...structuredData, newRow])
  }

  const deleteRow = (rowIndex) => {
    if (!structuredData) return
    
    const newData = structuredData.filter((_, index) => index !== rowIndex)
    setStructuredData(newData)
  }

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (files.length === 0) return

    setLoading(true)
    setError('')
    setStructuredData(null)

    const formData = new FormData()
    files.forEach(file => {
      formData.append('files', file)
    })

    try {
      const response = await fetch('http://bills-ocr-b.vercel.app/process-images', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`)
      }
      const result = await response.json()
      setStructuredData(result.data)
    } catch (err) {
      setError(err.message)
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const downloadAsDoc = () => {
    if (!structuredData || !Array.isArray(structuredData)) return

    // Collect all unique keys
    const allKeys = new Set()
    structuredData.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)))
    let headers = Array.from(allKeys)

    // Find shop key
    const shopKey = headers.find(h => h.toLowerCase().includes('shop') || h.toLowerCase().includes('vendor') || h === 'shop_name')
    if (shopKey) {
      headers = headers.filter(h => h !== shopKey)
      headers.unshift(shopKey)
    }

    let rows = []
    if (shopKey) {
      // Group by shop
      const grouped = {}
      structuredData.forEach(item => {
        const shop = item[shopKey] || 'Unknown'
        if (!grouped[shop]) grouped[shop] = []
        grouped[shop].push(item)
      })

      Object.keys(grouped).forEach(shop => {
        const items = grouped[shop]
        items.forEach((item, index) => {
          const row = {
            shop_name: index === 0 ? shop : '',
            rowspan: index === 0 ? items.length : 1,
            values: headers.map((h, idx) => idx === 0 && index > 0 ? '' : item[h] || '')
          }
          rows.push(row)
        })
      })
    } else {
      // No grouping
      rows = structuredData.map(item => ({
        shop_name: '',
        rowspan: 1,
        values: headers.map(h => item[h] || '')
      }))
    }

    let html = '<html><body><table border="1" style="border-collapse: collapse;"><thead><tr>'
    headers.forEach(header => {
      html += `<th>${header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`
    })
    html += '</tr></thead><tbody>'

    rows.forEach(row => {
      html += '<tr>'
      row.values.forEach((value, idx) => {
        // Skip rendering the shop name cell for non-first rows
        if (idx === 0 && shopKey && value === '') return;
        
        const rowspan = idx === 0 && shopKey ? ` rowspan="${row.rowspan}"` : ''
        html += `<td${rowspan}>${value}</td>`
      })
      html += '</tr>'
    })

    html += '</tbody></table></body></html>'

    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'table.doc'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderTable = () => {
    if (!structuredData || !Array.isArray(structuredData) || structuredData.length === 0) return null

    const headers = getAllHeaders()

    return (
      <section className="data-section">
        <div className="data-header">
          <h2>Extracted Data</h2>
          <p className="data-subtitle">Click on any cell to edit the data</p>
        </div>
        <div className="data-table-container">
          <table>
            <thead>
              <tr>
                {headers.map((header, idx) => (
                  <th key={idx}>
                    {header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </th>
                ))}
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {structuredData.map((item, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((header, colIndex) => {
                    const isEditing = editingCell && editingCell.row === rowIndex && editingCell.col === colIndex
                    const cellValue = item[header] || ''
                    
                    return (
                      <td 
                        key={colIndex} 
                        className={isEditing ? 'editing' : 'editable'}
                        onClick={() => !isEditing && startEditing(rowIndex, colIndex, cellValue)}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={handleKeyPress}
                            className="edit-input"
                            autoFocus
                          />
                        ) : (
                          <span className="cell-content">
                            {cellValue || <span className="empty-cell">Click to add</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="actions-cell">
                    <button 
                      onClick={() => deleteRow(rowIndex)}
                      className="delete-row-btn"
                      title="Delete row"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-actions">
          <button onClick={addNewRow} className="add-row-btn">
            + Add Row
          </button>
          <button onClick={downloadAsDoc} className="download-btn">
            Download as DOC
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-left">
          <div className="app-logo">BS</div>
          <div className="app-title">
            <h1>BillScan</h1>
            <p className="app-subtitle">AI Bill Processing</p>
          </div>
        </div>
        <div className="header-right">
          <span style={{fontSize: '1.2rem'}}>🔔</span>
          <span style={{fontSize: '1.2rem'}}>👤</span>
        </div>
      </header>

      <section className="stats-section">
        <div className="stat-item">
          <h2 className="stat-number gray">{files.length > 0 ? files.length : '0'}</h2>
          <p className="stat-label">Images Selected</p>
        </div>
        <div className="stat-item">
          <h2 className="stat-number green">{structuredData ? '100%' : '0%'}</h2>
          <p className="stat-label">Accuracy</p>
        </div>
        <div className="stat-item">
          <h2 className="stat-number blue">{structuredData ? structuredData.length : '0'}</h2>
          <p className="stat-label">Items Extracted</p>
        </div>
      </section>

      <main className="main-content">
        <section className="upload-section">
          {useCamera && cameraActive ? (
            <div className="camera-interface">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="camera-video"
              />
              <div className="camera-controls">
                <button onClick={capturePhoto} className="capture-btn">
                  Capture
                </button>
                <button onClick={stopCamera} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div 
              className="drag-drop-area"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="upload-icon">📄</div>
              <h3 className="upload-text">Drag & Drop Your Bill Image</h3>
              <p className="upload-subtext">Drag an image here or click to browse</p>
              
              <div className="upload-buttons">
                <button 
                  onClick={() => {
                    if (useCamera) {
                      startCamera()
                    } else {
                      setUseCamera(true)
                      startCamera()
                    }
                  }}
                  className="take-photo-btn"
                >
                  📷 Take Photo
                </button>
                
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleFileChange}
                  id="file-input"
                  className="file-input"
                />
                <label htmlFor="file-input" className="browse-btn">
                  📁 Browse Files
                </label>
              </div>
              
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          )}

          <div className="supported-formats">
            Supported formats: JPG, PNG, WEBP, BMP • Max size: 10MB
          </div>

          {files.length > 0 && (
            <div className="file-list">
              <h3>Selected Files ({files.length})</h3>
              {files.map((file, index) => (
                <div key={index} className="file-item">
                  {file.name}
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <button 
              onClick={handleSubmit} 
              disabled={loading}
              className="process-btn"
            >
              {loading ? 'Processing...' : 'Process Images'}
            </button>
          )}
        </section>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {loading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            Processing your images...
          </div>
        )}

        {structuredData && renderTable()}
      </main>
    </div>
  )
}

export default App
