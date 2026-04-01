                {/* Mobile Period Picker */}
                {isMobile && (
                    <div style={{ 
                        marginTop: '16px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        background: 'var(--bg-secondary)',
                        padding: '12px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)'
                    }}>
                        {PERIODS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setPeriod(p.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: period === p.id ? 'var(--accent)' : 'var(--surface)',
                                    color: period === p.id ? 'white' : 'var(--text)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    flex: '1 1 auto',
                                    justifyContent: 'center',
                                    minWidth: '70px'
                                }}
                            >
                                <span>{p.icon}</span>
                                <span>{p.label}</span>
                            </button>
                        ))}

                        {period === 'date' && (
                            <input
                                type="date"
                                className="form-input"
                                style={{ 
                                    width: '100%', 
                                    marginTop: '8px',
                                    padding: '12px',
                                    fontSize: '16px'
                                }}
                                value={specificDate}
                                onChange={(e) => setSpecificDate(e.target.value)}
                                max={new Date().toISOString().slice(0, 10)}
                            />
                        )}

                        {period === 'range' && (
                            <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                                <input
                                    type="date"
                                    className="form-input"
                                    style={{ flex: 1, padding: '12px', fontSize: '16px' }}
                                    value={rangeFrom}
                                    onChange={(e) => setRangeFrom(e.target.value)}
                                    max={new Date().toISOString().slice(0, 10)}
                                />
                                <input
                                    type="date"
                                    className="form-input"
                                    style={{ flex: 1, padding: '12px', fontSize: '16px' }}
                                    value={rangeTo}
                                    onChange={(e) => setRangeTo(e.target.value)}
                                    max={new Date().toISOString().slice(0, 10)}
                                />
                            </div>
                        )}
                    </div>
                )}