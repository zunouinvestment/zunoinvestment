// src/app/expense-tracker/page.tsx
'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileSpreadsheet, RefreshCcw, Filter, Settings, Edit2, Trash2, X, Plus, Calendar as CalendarIcon, Save, CreditCard, Banknote, ExternalLink, Link as LinkIcon } from 'lucide-react'
import { ExpenseRecord, ExpenseCategory, CardSetting } from '@/lib/expense/types'
import { supabase } from '@/lib/supabaseClient'

// --- 컴포넌트 ---
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`}>{children}</div>
}

// ✅ 카드사 링크 모달 (새로 추가됨)
function CardLinkModal({ onClose }: { onClose: () => void }) {
  const links = [
    { name: '삼성카드', url: 'https://www.samsungcard.com/', color: 'bg-blue-600' },
    { name: '현대카드', url: 'https://www.hyundaicard.com/', color: 'bg-indigo-600' },
    { name: '신한카드', url: 'https://www.shinhancard.com/', color: 'bg-blue-500' },
    { name: 'KB국민카드', url: 'https://card.kbcard.com/', color: 'bg-yellow-500 text-black' },
    { name: '롯데카드', url: 'https://www.lottecard.co.kr/', color: 'bg-red-500' },
    { name: '우리카드', url: 'https://www.wooricard.com/', color: 'bg-sky-500' },
    { name: '하나카드', url: 'https://www.hanacard.co.kr/', color: 'bg-teal-600' },
    { name: 'NH농협카드', url: 'https://card.nonghyup.com/', color: 'bg-green-600' },
    { name: 'BC카드', url: 'https://www.bccard.com/', color: 'bg-red-600' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl relative">
        <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <LinkIcon className="w-5 h-5"/> 카드사 홈페이지 바로가기
        </h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black">
            <X className="w-5 h-5"/>
        </button>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {links.map((link) => (
                <a 
                    key={link.name} 
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border hover:shadow-md transition-all hover:border-gray-400 group bg-gray-50 hover:bg-white"
                >
                    <span className="text-sm font-medium text-gray-700 group-hover:text-black">{link.name}</span>
                    <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-blue-500"/>
                </a>
            ))}
        </div>
        <p className="mt-4 text-xs text-gray-400 text-center">
            각 사이트에서 엑셀 이용내역을 다운로드 받아 업로드하세요.
        </p>
      </div>
    </div>
  )
}

function ManualAddModal({ 
  categories, settings, onClose, onSave 
}: { 
  categories: ExpenseCategory[]; 
  settings: CardSetting[]; 
  onClose: () => void; 
  onSave: (newItem: any) => void 
}) {
  const defaultCard = useMemo(() => {
    const cashOption = settings.find(s => s.calc_type === 'immediate')
    return cashOption ? cashOption.card_company : (settings[0]?.card_company || '')
  }, [settings])

  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    payment_date: '',
    card_company: defaultCard,
    description: '',
    amount: 0,
    category_id: null as number | null
  })

  const [selectedParent, setSelectedParent] = useState(categories[0]?.parent_name || '식비')

  const parentCategories = useMemo(() => Array.from(new Set(categories.map(c => c.parent_name))), [categories])
  const subCategories = useMemo(() => categories.filter(c => c.parent_name === selectedParent), [categories, selectedParent])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: name === 'amount' ? Number(value) : value }))
  }

  useEffect(() => {
    if (!formData.category_id && subCategories.length > 0) {
      setFormData(prev => ({ ...prev, category_id: subCategories[0].id }))
    }
  }, [selectedParent, subCategories])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
        <h3 className="text-lg font-bold flex justify-between items-center">
          지출 내역 직접 추가 <button onClick={onClose}><X className="w-5 h-5"/></button>
        </h3>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
               <label className="text-xs font-bold text-gray-500 block mb-1">이용일</label>
               <input type="date" name="transaction_date" value={formData.transaction_date} onChange={handleChange} className="border p-2 rounded w-full text-sm"/>
            </div>
            <div>
               <label className="text-xs font-bold text-gray-500 block mb-1">결제예정일(선택)</label>
               <input type="date" name="payment_date" value={formData.payment_date} onChange={handleChange} placeholder="자동 계산됨" className="border p-2 rounded w-full text-sm"/>
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">내역 (적요)</label>
            <input type="text" name="description" value={formData.description} onChange={handleChange} placeholder="예: 스타벅스 커피" className="border p-2 rounded w-full text-sm"/>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
               <label className="text-xs font-bold text-gray-500 block mb-1">금액</label>
               <input type="number" name="amount" value={formData.amount} onChange={handleChange} className="border p-2 rounded w-full text-sm font-mono"/>
            </div>
            <div>
               <label className="text-xs font-bold text-gray-500 block mb-1">결제수단</label>
               {settings.length > 0 ? (
                   <select 
                       name="card_company" 
                       value={formData.card_company} 
                       onChange={handleChange} 
                       className="border p-2 rounded w-full text-sm h-[38px]"
                   >
                       {settings.map(s => (
                           <option key={s.id} value={s.card_company}>{s.card_company}</option>
                       ))}
                   </select>
               ) : (
                   <input type="text" name="card_company" value={formData.card_company} onChange={handleChange} className="border p-2 rounded w-full text-sm" placeholder="직접 입력"/>
               )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">카테고리</label>
            <div className="flex gap-2">
                <select 
                    value={selectedParent}
                    onChange={(e) => setSelectedParent(e.target.value)}
                    className="border p-2 rounded w-1/2 text-sm"
                >
                    {parentCategories.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select 
                    value={formData.category_id || ''}
                    onChange={(e) => setFormData(prev => ({...prev, category_id: Number(e.target.value)}))}
                    className="border p-2 rounded w-1/2 text-sm"
                >
                    {subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">취소</button>
          <button onClick={() => onSave(formData)} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800">등록</button>
        </div>
      </div>
    </div>
  )
}

function CategoryCell({ item, categories, onUpdate }: { item: ExpenseRecord; categories: ExpenseCategory[]; onUpdate: (id: number, catId: number) => void }) {
    const [isEditing, setIsEditing] = useState(false)
    const [selectedParent, setSelectedParent] = useState(item.category?.parent_name || '식비')
    const [selectedCatId, setSelectedCatId] = useState(item.category_id || 0)

    const parentCategories = useMemo(() => Array.from(new Set(categories.map(c => c.parent_name))), [categories])
    const subCategories = useMemo(() => categories.filter(c => c.parent_name === selectedParent), [categories, selectedParent])

    const startEdit = () => {
        if(item.category) {
            setSelectedParent(item.category.parent_name)
            setSelectedCatId(item.category.id)
        }
        setIsEditing(true)
    }

    const saveEdit = () => {
        if(selectedCatId && selectedCatId !== item.category_id) {
            onUpdate(item.id, selectedCatId)
        }
        setIsEditing(false)
    }

    if (isEditing) {
        return (
            <div className="flex flex-col gap-1 min-w-[140px] z-20 relative bg-white p-1 border rounded shadow-lg">
                <select value={selectedParent} onChange={(e) => { setSelectedParent(e.target.value); const first = categories.find(c => c.parent_name === e.target.value); if(first) setSelectedCatId(first.id); }} className="text-xs border rounded p-1" autoFocus>
                    {parentCategories.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={selectedCatId} onChange={(e) => setSelectedCatId(Number(e.target.value))} className="text-xs border rounded p-1">
                    {subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="flex gap-1 mt-1">
                    <button onClick={saveEdit} className="flex-1 bg-blue-600 text-white text-[10px] py-1 rounded">저장</button>
                    <button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-200 text-gray-700 text-[10px] py-1 rounded">취소</button>
                </div>
            </div>
        )
    }

    return (
        <div onClick={startEdit} className="cursor-pointer group relative">
            {item.category ? (
                <div className="flex flex-col items-start gap-0.5">
                    <span className="text-[10px] text-gray-500 font-semibold flex items-center gap-1">
                        {item.category.parent_name}
                        <Edit2 className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                    </span>
                    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium text-white shadow-sm hover:opacity-80 transition-opacity" style={{ backgroundColor: item.category.color }}>
                        {item.category.name}
                    </span>
                </div>
            ) : <span className="text-gray-300 text-xs hover:text-gray-500">카테고리 지정 필요</span>}
        </div>
    )
}

function EditModal({ item, categories, onClose, onSave }: { item: ExpenseRecord; categories: ExpenseCategory[]; onClose: () => void; onSave: (updated: ExpenseRecord) => void }) {
  const [formData, setFormData] = useState({ ...item })
  const initialCat = categories.find(c => c.id === item.category_id)
  const [selectedParent, setSelectedParent] = useState(initialCat?.parent_name || '식비')

  const parentCategories = useMemo(() => Array.from(new Set(categories.map(c => c.parent_name))), [categories])
  const subCategories = useMemo(() => categories.filter(c => c.parent_name === selectedParent), [categories, selectedParent])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: name === 'amount' ? Number(value) : value }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
        <h3 className="text-lg font-bold flex justify-between">
          내역 상세 수정 <button onClick={onClose}><X className="w-5 h-5"/></button>
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-bold block mb-1">이용일 / 결제예정일</label>
            <div className="flex gap-2">
              <input type="date" name="transaction_date" value={formData.transaction_date} onChange={handleChange} className="border p-2 rounded w-full text-sm"/>
              <input type="date" name="payment_date" value={formData.payment_date || ''} onChange={handleChange} className="border p-2 rounded w-full text-sm"/>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-bold block mb-1">적요 / 카드사</label>
            <div className="flex gap-2">
              <input type="text" name="description" value={formData.description} onChange={handleChange} className="border p-2 rounded w-full text-sm"/>
              <input type="text" name="card_company" value={formData.card_company} onChange={handleChange} className="border p-2 rounded w-1/3 text-sm"/>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-bold block mb-1">금액</label>
            <input type="number" name="amount" value={formData.amount} onChange={handleChange} className="border p-2 rounded w-full text-sm font-mono"/>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-bold block mb-1">카테고리</label>
            <div className="flex gap-2">
                <select value={selectedParent} onChange={(e) => { setSelectedParent(e.target.value); const first = categories.find(c => c.parent_name === e.target.value); if(first) setFormData(prev => ({...prev, category_id: first.id, category: first})); }} className="border p-2 rounded w-1/2 text-sm">
                    {parentCategories.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select name="category_id" value={formData.category_id || ''} onChange={(e) => { const catId = Number(e.target.value); const cat = categories.find(c => c.id === catId); setFormData(prev => ({ ...prev, category_id: catId, category: cat })); }} className="border p-2 rounded w-1/2 text-sm">
                    {subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">취소</button>
          <button onClick={() => onSave(formData)} className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800">저장</button>
        </div>
      </div>
    </div>
  )
}

function RowSetting({ 
    setting, onSave, onDelete
}: { 
    setting: CardSetting, onSave: (c: string, p: number, s: number, type: 'sliding' | 'immediate') => void, onDelete: (c: string) => void
}) {
    const [paymentDay, setPaymentDay] = useState(setting.payment_day)
    const [startDay, setStartDay] = useState(setting.usage_start_day)
    const [calcType, setCalcType] = useState<'sliding' | 'immediate'>(setting.calc_type === 'immediate' ? 'immediate' : 'sliding')

    return (
        <tr className="group">
            <td className="px-4 py-3 font-medium text-gray-700 flex items-center gap-2">
                {calcType === 'immediate' ? <Banknote className="w-4 h-4 text-green-600"/> : <CreditCard className="w-4 h-4 text-blue-600"/>}
                {setting.card_company}
            </td>
            <td className="px-4 py-3">
                <select 
                    value={calcType}
                    onChange={(e) => setCalcType(e.target.value as any)}
                    className="border rounded p-1 text-xs"
                >
                    <option value="sliding">신용카드</option>
                    <option value="immediate">현금/즉시</option>
                </select>
            </td>
            <td className="px-4 py-3">
                {calcType === 'sliding' ? (
                    <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">매월</span>
                        <input type="number" min="1" max="31" value={paymentDay} onChange={e => setPaymentDay(Number(e.target.value))} className="border rounded p-1 w-10 text-center font-mono text-xs"/>
                        <span className="text-gray-600 text-xs">일</span>
                    </div>
                ) : <span className="text-gray-300 text-xs">-</span>}
            </td>
            <td className="px-4 py-3">
                 {calcType === 'sliding' ? (
                    <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">전월</span>
                        <input type="number" min="1" max="31" value={startDay} onChange={e => setStartDay(Number(e.target.value))} className="border rounded p-1 w-10 text-center font-mono text-xs"/>
                        <span className="text-gray-600 text-xs">일부터</span>
                    </div>
                ) : <span className="text-gray-300 text-xs">-</span>}
            </td>
            <td className="px-4 py-3 flex items-center gap-2">
                <button onClick={() => onSave(setting.card_company, paymentDay, startDay, calcType)} className="px-3 py-1.5 bg-black text-white text-xs rounded hover:bg-gray-800">수정</button>
                <button onClick={() => onDelete(setting.card_company)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
            </td>
        </tr>
    )
}

// === 메인 페이지 ===
export default function ExpenseTrackerPage() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [cardSettings, setCardSettings] = useState<CardSetting[]>([])
  
  const [loading, setLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'settings'>('list')
  const [editingItem, setEditingItem] = useState<ExpenseRecord | null>(null)
  
  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false) // ✅ 카드사 링크 모달 상태

  // 카드 추가 폼
  const [newCardName, setNewCardName] = useState('')
  const [newType, setNewType] = useState<'sliding'|'immediate'>('sliding')
  const [newPayDay, setNewPayDay] = useState('13')
  const [newStartDay, setNewStartDay] = useState('1')

  const [filterMode, setFilterMode] = useState<'transaction' | 'payment'>('transaction')
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [filterCard, setFilterCard] = useState('ALL')
  const [filterCategory, setFilterCategory] = useState('ALL')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ mode: filterMode, startDate, endDate, card: filterCard })
      const res = await fetch(`/api/expenses?${qs}`)
      const data = await res.json()
      
      let filteredData = data;
      if (filterCategory !== 'ALL') {
         filteredData = data.filter((item: ExpenseRecord) => item.category?.parent_name === filterCategory)
      }
      if(Array.isArray(filteredData)) setExpenses(filteredData)

      const { data: catData } = await supabase.from('expense_categories').select('*').order('id')
      if (catData) setCategories(catData)

      const resSet = await fetch('/api/expenses/settings')
      const setData = await resSet.json()
      if(Array.isArray(setData)) setCardSettings(setData)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [filterMode, startDate, endDate, filterCard, filterCategory])

  const parentCategories = useMemo(() => {
    return Array.from(new Set(categories.map(c => c.parent_name)))
  }, [categories])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!confirm(`${file.name} 파일을 업로드 하시겠습니까?`)) { if(fileInputRef.current) fileInputRef.current.value = ''; return; }
    setIsUploading(true); const formData = new FormData(); formData.append('file', file);
    try { const res = await fetch('/api/expenses/upload', { method: 'POST', body: formData }); const result = await res.json(); if (!res.ok) throw new Error(result.error); alert(`${result.count}건 등록 완료!`); loadData(); } catch (err: any) { alert(`실패: ${err.message}`) } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }
  const handleSaveEdit = async (updated: ExpenseRecord) => { try { const res = await fetch('/api/expenses', { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updated) }); if(!res.ok) throw new Error('수정 실패'); setExpenses(prev => prev.map(p => { if(p.id !== updated.id) return p; const newCat = categories.find(c => c.id === updated.category_id); return { ...updated, category: newCat }; })); setEditingItem(null) } catch (e) { alert('오류가 발생했습니다.') } }
  const handleInlineUpdate = async (id: number, catId: number) => { try { const res = await fetch('/api/expenses', { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id, category_id: catId }) }); if(!res.ok) throw new Error('수정 실패'); const newCat = categories.find(c => c.id === catId); setExpenses(prev => prev.map(p => p.id === id ? { ...p, category_id: catId, category: newCat } : p)) } catch (e) { alert('변경 실패') } }
  const handleManualAdd = async (newItem: any) => { try { const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem) }); if (!res.ok) throw new Error('등록 실패'); alert('등록되었습니다.'); setShowAddModal(false); loadData(); } catch (e: any) { alert(e.message) } }
  const handleDelete = async (id: number) => { if(!confirm('정말 삭제하시겠습니까?')) return; await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' }); setExpenses(prev => prev.filter(p => p.id !== id)) }
  const handleSaveSetting = async (cardName: string, pDay: number, sDay: number, type: 'sliding' | 'immediate') => { if(!cardName) return alert('명칭을 입력해주세요.'); try { const res = await fetch('/api/expenses/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card_company: cardName, payment_day: pDay, usage_start_day: sDay, calc_type: type }) }); if (!res.ok) throw new Error('저장 실패'); setNewCardName(''); setNewPayDay('13'); setNewStartDay('1'); setNewType('sliding'); loadData() } catch(e) { alert('오류가 발생했습니다.') } }
  const handleDeleteSetting = async (company: string) => { if(!confirm(`${company} 설정을 삭제하시겠습니까?`)) return; await fetch(`/api/expenses/settings?company=${encodeURIComponent(company)}`, { method: 'DELETE' }); loadData() }
  const totalAmount = expenses.reduce((acc, cur) => acc + cur.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expense Tracker</h1>
          <p className="text-sm text-gray-500">지출 내역을 관리하고 분석합니다.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-md">
                <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all flex items-center gap-2 ${viewMode === 'list' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}><FileSpreadsheet className="w-3 h-3" /> 목록</button>
                <button onClick={() => setViewMode('settings')} className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all flex items-center gap-2 ${viewMode === 'settings' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}><Settings className="w-3 h-3" /> 설정</button>
            </div>
            
            <div className="w-px h-6 bg-gray-300 mx-2"></div>
            
            {/* ✅ 카드사 링크 버튼 */}
            <button 
                onClick={() => setShowLinkModal(true)}
                className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-50 transition text-sm font-medium"
            >
                <LinkIcon className="w-4 h-4" /> 카드사
            </button>

            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-black text-white px-3 py-2 rounded-md hover:bg-gray-800 transition text-sm font-medium"><Plus className="w-4 h-4" /> 직접 추가</button>
            <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium">{isUploading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 업로드</button>
        </div>
      </div>

      {viewMode === 'list' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-white p-4 rounded-xl border flex flex-wrap gap-4 items-center shadow-sm">
                <div className="flex items-center gap-2 text-sm border-r pr-4">
                    <Filter className="w-4 h-4 text-gray-500"/>
                    <select className="border-none bg-transparent font-bold text-gray-700 outline-none" value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)}>
                        <option value="transaction">실사용일 기준</option>
                        <option value="payment">결제일 기준</option>
                    </select>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-gray-700 flex items-center gap-1"><CalendarIcon className="w-3 h-3"/> 기간:</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-1 text-gray-600 outline-none focus:border-black"/>
                    <span className="text-gray-400">~</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-1 text-gray-600 outline-none focus:border-black"/>
                </div>
                
                <div className="flex items-center gap-2 text-sm ml-auto border-r pr-4">
                    <span className="font-bold text-gray-700">카테고리:</span>
                    <select className="border rounded p-1 outline-none focus:border-black max-w-[120px]" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                        <option value="ALL">전체</option>
                        {parentCategories.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-gray-700">카드사:</span>
                    <select className="border rounded p-1 outline-none focus:border-black max-w-[120px]" value={filterCard} onChange={(e) => setFilterCard(e.target.value)}>
                        <option value="ALL">전체</option>
                        {Array.from(new Set(expenses.map(e => e.card_company))).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            <Card>
                <div className="flex justify-between items-end">
                    <div><div className="text-sm text-gray-500 mb-1">선택 기간 총액</div><div className="text-3xl font-bold">{totalAmount.toLocaleString()}원</div></div>
                    <div className="text-right text-xs text-gray-400">{expenses.length}건 내역</div>
                </div>
            </Card>

            <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm text-left relative">
                        <thead className="text-gray-500 bg-gray-50 border-b sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 font-medium">이용일</th>
                                <th className="px-6 py-3 font-medium">결제일</th>
                                <th className="px-6 py-3 font-medium">카테고리</th>
                                <th className="px-6 py-3 font-medium">내역</th>
                                <th className="px-6 py-3 font-medium text-right">금액</th>
                                <th className="px-6 py-3 font-medium">카드사</th>
                                <th className="px-6 py-3 font-medium text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? ( <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">로딩 중...</td></tr> ) 
                            : expenses.length === 0 ? ( <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">내역이 없습니다.</td></tr> ) 
                            : ( expenses.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-3 text-gray-600 font-mono text-xs">{item.transaction_date}</td>
                                        <td className="px-6 py-3 text-gray-400 font-mono text-xs">{item.payment_date || '-'}</td>
                                        <td className="px-6 py-3"><CategoryCell item={item} categories={categories} onUpdate={handleInlineUpdate} /></td>
                                        <td className="px-6 py-3 font-medium text-gray-900 truncate max-w-[200px]">{item.description}</td>
                                        <td className="px-6 py-3 text-right font-medium text-gray-900">{item.amount.toLocaleString()}</td>
                                        <td className="px-6 py-3 text-gray-400 text-xs">{item.card_company}</td>
                                        <td className="px-6 py-3 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditingItem(item)} className="p-1 hover:bg-gray-200 rounded text-blue-600"><Edit2 className="w-4 h-4"/></button>
                                            <button onClick={() => handleDelete(item.id)} className="p-1 hover:bg-gray-200 rounded text-red-600"><Trash2 className="w-4 h-4"/></button>
                                        </td>
                                    </tr>
                            )))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </motion.div>
      )}

      {viewMode === 'settings' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings className="w-5 h-5"/> 결제 수단 및 기준 설정</h2>
                    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 border-b"><tr><th className="px-4 py-2">명칭 (카드사/현금)</th><th className="px-4 py-2">유형</th><th className="px-4 py-2">결제일 (매월)</th><th className="px-4 py-2">시작일 (전월)</th><th className="px-4 py-2">관리</th></tr></thead><tbody className="divide-y">{cardSettings.map(setting => <RowSetting key={setting.card_company} setting={setting} onSave={handleSaveSetting} onDelete={handleDeleteSetting} />)}</tbody></table></div>
                </Card>
                <Card className="h-fit">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Plus className="w-4 h-4"/> 새 결제 수단 추가</h3>
                    <div className="space-y-3">
                        <div><label className="text-xs font-bold text-gray-500 block mb-1">명칭 (엑셀과 일치)</label><input type="text" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} className="w-full border rounded p-2 text-sm" placeholder="예: 현금, 삼성"/></div>
                        <div><label className="text-xs font-bold text-gray-500 block mb-1">유형</label><select value={newType} onChange={(e) => setNewType(e.target.value as any)} className="w-full border rounded p-2 text-sm"><option value="sliding">신용카드 (결제일 계산)</option><option value="immediate">현금/즉시 (이용일=결제일)</option></select></div>
                        {newType === 'sliding' && (<div className="grid grid-cols-2 gap-2"><div><label className="text-xs font-bold text-gray-500 block mb-1">결제일</label><input type="number" value={newPayDay} onChange={(e) => setNewPayDay(e.target.value)} className="w-full border rounded p-2 text-sm"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">이용 시작일</label><input type="number" value={newStartDay} onChange={(e) => setNewStartDay(e.target.value)} className="w-full border rounded p-2 text-sm"/></div></div>)}
                        <button onClick={() => handleSaveSetting(newCardName, Number(newPayDay), Number(newStartDay), newType)} className="w-full bg-black text-white py-2 rounded-md text-sm font-bold hover:bg-gray-800">추가하기</button>
                    </div>
                </Card>
            </div>
        </motion.div>
      )}

      {showAddModal && <ManualAddModal categories={categories} settings={cardSettings} onClose={() => setShowAddModal(false)} onSave={handleManualAdd} />}
      {editingItem && <EditModal item={editingItem} categories={categories} onClose={() => setEditingItem(null)} onSave={handleSaveEdit} />}
      {/* ✅ 카드사 링크 모달 렌더링 */}
      {showLinkModal && <CardLinkModal onClose={() => setShowLinkModal(false)} />}
    </div>
  )
}