// src/app/expense-tracker/page.tsx
'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileSpreadsheet, RefreshCcw, Filter, Settings, Edit2, Trash2, X, Plus, Calendar as CalendarIcon, Save, CreditCard, Banknote, ExternalLink, Link as LinkIcon, FolderTree, Tag } from 'lucide-react'
import { ExpenseRecord, ExpenseCategory, CardSetting } from '@/lib/expense/types'
import { supabase } from '@/lib/supabaseClient'

// --- 컴포넌트 ---
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5 ${className}`}>{children}</div>
}

// ✅ 카테고리 추가/수정 모달
function CategoryModal({ 
    category, onClose, onSave 
}: { 
    category?: ExpenseCategory | null, 
    onClose: () => void, 
    onSave: (data: any) => void 
}) {
    const [formData, setFormData] = useState({
        parent_name: category?.parent_name || '',
        name: category?.name || '',
        color: category?.color || '#94a3b8',
        keywords: category?.keywords?.join(', ') || ''
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-4">{category ? '카테고리 수정' : '새 카테고리 추가'}</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">대분류 (예: 식비)</label>
                        <input type="text" name="parent_name" value={formData.parent_name} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="그룹명 입력"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">소분류 (예: 커피)</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="항목명 입력"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">색상 태그</label>
                        <div className="flex gap-2 items-center">
                            <input type="color" name="color" value={formData.color} onChange={handleChange} className="h-9 w-16 p-0 border rounded cursor-pointer"/>
                            <span className="text-xs text-gray-400">{formData.color}</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">자동분류 키워드 (쉼표로 구분)</label>
                        <input type="text" name="keywords" value={formData.keywords} onChange={handleChange} className="w-full border rounded p-2 text-sm" placeholder="예: 스타벅스, 이디야"/>
                    </div>
                </div>
                <div className="flex gap-2 mt-6">
                    <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded text-sm text-gray-600 hover:bg-gray-200">취소</button>
                    <button onClick={() => onSave({...formData, id: category?.id})} className="flex-1 py-2 bg-black text-white rounded text-sm hover:bg-gray-800">저장</button>
                </div>
            </motion.div>
        </div>
    )
}

// ... (기존 CardLinkModal, ManualAddModal, CategoryCell, EditModal, RowSetting 컴포넌트 유지) ...
// 코드 길이상 중복되는 부분은 생략하지 않고 전체 코드를 드립니다. 
// 아래 코드를 그대로 덮어쓰세요.

function CardLinkModal({ onClose }: { onClose: () => void }) {
  const links = [
    { name: '삼성', url: 'https://www.samsungcard.com/', color: 'text-blue-600' },
    { name: '현대', url: 'https://www.hyundaicard.com/', color: 'text-indigo-600' },
    { name: '신한', url: 'https://www.shinhancard.com/', color: 'text-blue-500' },
    { name: 'KB국민', url: 'https://card.kbcard.com/', color: 'text-yellow-600' },
    { name: '롯데', url: 'https://www.lottecard.co.kr/', color: 'text-red-500' },
    { name: '우리', url: 'https://www.wooricard.com/', color: 'text-sky-500' },
    { name: '하나', url: 'https://www.hanacard.co.kr/', color: 'text-teal-600' },
    { name: 'NH농협', url: 'https://card.nonghyup.com/', color: 'text-green-600' },
    { name: 'BC', url: 'https://www.bccard.com/', color: 'text-red-600' },
  ]
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-xl w-full max-w-md p-5 shadow-2xl relative">
        <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><LinkIcon className="w-5 h-5"/> 카드사 바로가기</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black p-1"><X className="w-6 h-6"/></button>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
            {links.map((link) => ( <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 active:bg-gray-100 transition-colors"><span className={`text-sm font-bold ${link.color}`}>{link.name}</span><ExternalLink className="w-4 h-4 text-gray-400"/></a> ))}
        </div>
      </motion.div>
    </div>
  )
}

function ManualAddModal({ categories, settings, onClose, onSave }: { categories: ExpenseCategory[]; settings: CardSetting[]; onClose: () => void; onSave: (newItem: any) => void }) {
  const defaultCard = useMemo(() => { const cashOption = settings.find(s => s.calc_type === 'immediate'); return cashOption ? cashOption.card_company : (settings[0]?.card_company || ''); }, [settings])
  const [formData, setFormData] = useState({ transaction_date: new Date().toISOString().split('T')[0], payment_date: '', card_company: defaultCard, description: '', amount: 0, category_id: null as number | null })
  const [selectedParent, setSelectedParent] = useState(categories[0]?.parent_name || '식비')
  const parentCategories = useMemo(() => Array.from(new Set(categories.map(c => c.parent_name))), [categories])
  const subCategories = useMemo(() => categories.filter(c => c.parent_name === selectedParent), [categories, selectedParent])
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: name === 'amount' ? Number(value) : value })) }
  useEffect(() => { if (!formData.category_id && subCategories.length > 0) { setFormData(prev => ({ ...prev, category_id: subCategories[0].id })) } }, [selectedParent, subCategories])
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold flex justify-between items-center">내역 추가 <button onClick={onClose}><X className="w-6 h-6 text-gray-500"/></button></h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold text-gray-500 block mb-1">이용일</label><input type="date" name="transaction_date" value={formData.transaction_date} onChange={handleChange} className="border p-2 rounded w-full text-sm"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">결제예정일(선택)</label><input type="date" name="payment_date" value={formData.payment_date} onChange={handleChange} className="border p-2 rounded w-full text-sm text-gray-400"/></div></div>
          <div><label className="text-xs font-bold text-gray-500 block mb-1">내역</label><input type="text" name="description" value={formData.description} onChange={handleChange} placeholder="내용 입력" className="border p-2 rounded w-full text-sm"/></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold text-gray-500 block mb-1">금액</label><input type="number" name="amount" value={formData.amount} onChange={handleChange} className="border p-2 rounded w-full text-sm font-mono"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">결제수단</label>{settings.length > 0 ? ( <select name="card_company" value={formData.card_company} onChange={handleChange} className="border p-2 rounded w-full text-sm h-[38px] bg-white"> {settings.map(s => ( <option key={s.id} value={s.card_company}>{s.card_company}</option> ))} </select> ) : ( <input type="text" name="card_company" value={formData.card_company} onChange={handleChange} className="border p-2 rounded w-full text-sm" placeholder="직접 입력"/> )}</div></div>
          <div><label className="text-xs font-bold text-gray-500 block mb-1">카테고리</label><div className="flex gap-2"><select value={selectedParent} onChange={(e) => setSelectedParent(e.target.value)} className="border p-2 rounded w-1/2 text-sm bg-white">{parentCategories.map(p => <option key={p} value={p}>{p}</option>)}</select><select value={formData.category_id || ''} onChange={(e) => setFormData(prev => ({...prev, category_id: Number(e.target.value)}))} className="border p-2 rounded w-1/2 text-sm bg-white">{subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>
        </div>
        <div className="flex gap-2 mt-4 pt-2"><button onClick={onClose} className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-lg text-sm font-medium">취소</button><button onClick={() => onSave(formData)} className="flex-1 py-3 bg-black text-white rounded-lg text-sm font-bold">등록</button></div>
      </motion.div>
    </div>
  )
}

function CategoryCell({ item, categories, onUpdate }: { item: ExpenseRecord; categories: ExpenseCategory[]; onUpdate: (id: number, catId: number) => void }) {
    const [isEditing, setIsEditing] = useState(false)
    const [selectedParent, setSelectedParent] = useState(item.category?.parent_name || '식비')
    const [selectedCatId, setSelectedCatId] = useState(item.category_id || 0)
    const parentCategories = useMemo(() => Array.from(new Set(categories.map(c => c.parent_name))), [categories])
    const subCategories = useMemo(() => categories.filter(c => c.parent_name === selectedParent), [categories, selectedParent])
    const startEdit = () => { if(item.category) { setSelectedParent(item.category.parent_name); setSelectedCatId(item.category.id); } setIsEditing(true); }
    const saveEdit = () => { if(selectedCatId && selectedCatId !== item.category_id) { onUpdate(item.id, selectedCatId); } setIsEditing(false); }
    if (isEditing) { return ( <div className="flex flex-col gap-1 min-w-[120px] z-20 relative bg-white p-1 border rounded shadow-xl"> <select value={selectedParent} onChange={(e) => { setSelectedParent(e.target.value); const first = categories.find(c => c.parent_name === e.target.value); if(first) setSelectedCatId(first.id); }} className="text-xs border rounded p-1" autoFocus> {parentCategories.map(p => <option key={p} value={p}>{p}</option>)} </select> <select value={selectedCatId} onChange={(e) => setSelectedCatId(Number(e.target.value))} className="text-xs border rounded p-1"> {subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)} </select> <div className="flex gap-1 mt-1"> <button onClick={saveEdit} className="flex-1 bg-blue-600 text-white text-[10px] py-1 rounded">저장</button> <button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-200 text-gray-700 text-[10px] py-1 rounded">취소</button> </div> </div> ) }
    return ( <div onClick={startEdit} className="cursor-pointer group relative"> {item.category ? ( <div className="flex flex-col items-start gap-0.5"> <span className="text-[10px] text-gray-500 font-semibold flex items-center gap-1 whitespace-nowrap"> {item.category.parent_name} <Edit2 className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" /> </span> <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] md:text-[11px] font-medium text-white shadow-sm hover:opacity-80 transition-opacity whitespace-nowrap" style={{ backgroundColor: item.category.color }}> {item.category.name} </span> </div> ) : <span className="text-gray-300 text-xs hover:text-gray-500 whitespace-nowrap">카테고리 없음</span>} </div> )
}

function EditModal({ item, categories, onClose, onSave }: { item: ExpenseRecord; categories: ExpenseCategory[]; onClose: () => void; onSave: (updated: ExpenseRecord) => void }) {
  const [formData, setFormData] = useState({ ...item })
  const initialCat = categories.find(c => c.id === item.category_id)
  const [selectedParent, setSelectedParent] = useState(initialCat?.parent_name || '식비')
  const parentCategories = useMemo(() => Array.from(new Set(categories.map(c => c.parent_name))), [categories])
  const subCategories = useMemo(() => categories.filter(c => c.parent_name === selectedParent), [categories, selectedParent])
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: name === 'amount' ? Number(value) : value })) }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold flex justify-between">내역 수정 <button onClick={onClose}><X className="w-6 h-6"/></button></h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold text-gray-500 block mb-1">이용일</label><input type="date" name="transaction_date" value={formData.transaction_date} onChange={handleChange} className="border p-2 rounded w-full text-sm"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">결제예정일</label><input type="date" name="payment_date" value={formData.payment_date || ''} onChange={handleChange} className="border p-2 rounded w-full text-sm"/></div></div>
          <div><label className="text-xs font-bold text-gray-500 block mb-1">내역</label><input type="text" name="description" value={formData.description} onChange={handleChange} className="border p-2 rounded w-full text-sm"/></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold text-gray-500 block mb-1">금액</label><input type="number" name="amount" value={formData.amount} onChange={handleChange} className="border p-2 rounded w-full text-sm font-mono"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">카드사</label><input type="text" name="card_company" value={formData.card_company} onChange={handleChange} className="border p-2 rounded w-full text-sm"/></div></div>
          <div><label className="text-xs font-bold text-gray-500 block mb-1">카테고리</label><div className="flex gap-2"><select value={selectedParent} onChange={(e) => { setSelectedParent(e.target.value); const first = categories.find(c => c.parent_name === e.target.value); if(first) setFormData(prev => ({...prev, category_id: first.id, category: first})); }} className="border p-2 rounded w-1/2 text-sm bg-white">{parentCategories.map(p => <option key={p} value={p}>{p}</option>)}</select><select name="category_id" value={formData.category_id || ''} onChange={(e) => { const catId = Number(e.target.value); const cat = categories.find(c => c.id === catId); setFormData(prev => ({ ...prev, category_id: catId, category: cat })); }} className="border p-2 rounded w-1/2 text-sm bg-white">{subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>
        </div>
        <div className="flex gap-2 mt-4 pt-2"><button onClick={onClose} className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-lg text-sm font-medium">취소</button><button onClick={() => onSave(formData)} className="flex-1 py-3 bg-black text-white rounded-lg text-sm font-bold">저장</button></div>
      </motion.div>
    </div>
  )
}

function RowSetting({ setting, onSave, onDelete }: { setting: CardSetting, onSave: (c: string, p: number, s: number, type: 'sliding' | 'immediate') => void, onDelete: (c: string) => void }) {
    const [paymentDay, setPaymentDay] = useState(setting.payment_day)
    const [startDay, setStartDay] = useState(setting.usage_start_day)
    const [calcType, setCalcType] = useState<'sliding' | 'immediate'>(setting.calc_type === 'immediate' ? 'immediate' : 'sliding')
    return (
        <tr className="group hover:bg-gray-50 transition-colors">
            <td className="px-3 py-3 md:px-4 font-medium text-gray-700 flex items-center gap-2 text-xs md:text-sm whitespace-nowrap">{calcType === 'immediate' ? <Banknote className="w-4 h-4 text-green-600"/> : <CreditCard className="w-4 h-4 text-blue-600"/>}{setting.card_company}</td>
            <td className="px-3 py-3 md:px-4"><select value={calcType} onChange={(e) => setCalcType(e.target.value as any)} className="border rounded p-1 text-xs bg-white"><option value="sliding">신용</option><option value="immediate">현금</option></select></td>
            <td className="px-3 py-3 md:px-4">{calcType === 'sliding' ? (<div className="flex items-center gap-1"><span className="hidden md:inline text-gray-400 text-xs">매월</span><input type="number" min="1" max="31" value={paymentDay} onChange={e => setPaymentDay(Number(e.target.value))} className="border rounded p-1 w-10 text-center font-mono text-xs"/><span className="text-gray-600 text-xs">일</span></div>) : <span className="text-gray-300 text-xs">-</span>}</td>
            <td className="px-3 py-3 md:px-4">{calcType === 'sliding' ? (<div className="flex items-center gap-1"><span className="hidden md:inline text-gray-400 text-xs">전월</span><input type="number" min="1" max="31" value={startDay} onChange={e => setStartDay(Number(e.target.value))} className="border rounded p-1 w-10 text-center font-mono text-xs"/><span className="text-gray-600 text-xs">부터</span></div>) : <span className="text-gray-300 text-xs">-</span>}</td>
            <td className="px-3 py-3 md:px-4 flex items-center gap-1"><button onClick={() => onSave(setting.card_company, paymentDay, startDay, calcType)} className="px-2 py-1 bg-black text-white text-xs rounded hover:bg-gray-800">수정</button><button onClick={() => onDelete(setting.card_company)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button></td>
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
  const [settingsTab, setSettingsTab] = useState<'card' | 'category'>('card') // ✅ 설정 탭 상태 추가

  const [editingItem, setEditingItem] = useState<ExpenseRecord | null>(null)
  
  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null | undefined>(undefined) // undefined: 모달 닫힘, null: 추가, 객체: 수정

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

  const groupedCategories = useMemo(() => {
    const groups: Record<string, ExpenseCategory[]> = {}
    categories.forEach(c => {
        if(!groups[c.parent_name]) groups[c.parent_name] = []
        groups[c.parent_name].push(c)
    })
    return groups
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
  
  // ✅ 카테고리 저장/수정 핸들러
  const handleSaveCategory = async (data: any) => {
    try {
        const url = '/api/expenses/categories'
        const method = data.id ? 'PATCH' : 'POST'
        const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) })
        if(!res.ok) throw new Error('저장 실패')
        setEditingCategory(undefined)
        loadData()
    } catch(e) { alert('오류가 발생했습니다.') }
  }
  // ✅ 카테고리 삭제 핸들러
  const handleDeleteCategory = async (id: number) => {
    if(!confirm('카테고리를 삭제하시겠습니까? (사용 중인 경우 삭제되지 않습니다)')) return
    try {
        const res = await fetch(`/api/expenses/categories?id=${id}`, { method: 'DELETE' })
        if(!res.ok) { const err = await res.json(); throw new Error(err.error) }
        loadData()
    } catch(e: any) { alert(e.message) }
  }

  const totalAmount = expenses.reduce((acc, cur) => acc + cur.amount, 0)

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h1 className="text-xl md:text-2xl font-bold tracking-tight">Expense Tracker</h1><p className="text-xs md:text-sm text-gray-500">지출 내역을 관리하고 분석합니다.</p></div>
        <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-md">
                <button onClick={() => setViewMode('list')} className={`px-2 py-1.5 md:px-3 text-xs font-medium rounded-sm transition-all flex items-center gap-1 md:gap-2 ${viewMode === 'list' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}><FileSpreadsheet className="w-3 h-3 md:w-4 md:h-4" /> 목록</button>
                <button onClick={() => setViewMode('settings')} className={`px-2 py-1.5 md:px-3 text-xs font-medium rounded-sm transition-all flex items-center gap-1 md:gap-2 ${viewMode === 'settings' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}><Settings className="w-3 h-3 md:w-4 md:h-4" /> 설정</button>
            </div>
            <div className="w-px h-6 bg-gray-300 mx-1 md:mx-2"></div>
            <button onClick={() => setShowLinkModal(true)} className="flex items-center gap-1 md:gap-2 bg-white border border-gray-300 text-gray-700 px-2 py-1.5 md:px-3 md:py-2 rounded-md hover:bg-gray-50 transition text-xs md:text-sm font-medium whitespace-nowrap"><LinkIcon className="w-3 h-3 md:w-4 md:h-4" /> 카드사</button>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 md:gap-2 bg-black text-white px-2 py-1.5 md:px-3 md:py-2 rounded-md hover:bg-gray-800 transition text-xs md:text-sm font-medium whitespace-nowrap"><Plus className="w-3 h-3 md:w-4 md:h-4" /> 추가</button>
            <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex items-center gap-1 md:gap-2 bg-blue-600 text-white px-2 py-1.5 md:px-3 md:py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50 text-xs md:text-sm font-medium whitespace-nowrap">{isUploading ? <RefreshCcw className="w-3 h-3 md:w-4 md:h-4 animate-spin" /> : <Upload className="w-3 h-3 md:w-4 md:h-4" />} 업로드</button>
        </div>
      </div>

      {viewMode === 'list' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-white p-3 md:p-4 rounded-xl border flex flex-wrap gap-2 md:gap-4 items-center shadow-sm text-xs md:text-sm">
                <div className="flex items-center gap-1 md:gap-2 border-r pr-2 md:pr-4">
                    <Filter className="w-3 h-3 md:w-4 md:h-4 text-gray-500"/>
                    <select className="border-none bg-transparent font-bold text-gray-700 outline-none" value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)}>
                        <option value="transaction">소비일</option>
                        <option value="payment">결제일</option>
                    </select>
                </div>
                <div className="flex items-center gap-1 md:gap-2 w-full md:w-auto">
                    <CalendarIcon className="w-3 h-3 md:w-4 md:h-4 text-gray-500 hidden md:block"/>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded p-1 text-gray-600 outline-none focus:border-black flex-1 md:flex-none"/>
                    <span className="text-gray-400">~</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded p-1 text-gray-600 outline-none focus:border-black flex-1 md:flex-none"/>
                </div>
                <div className="flex items-center gap-1 md:gap-2 ml-auto w-1/2 md:w-auto"><select className="border rounded p-1 outline-none focus:border-black w-full md:w-[120px]" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}><option value="ALL">전체 카테고리</option>{parentCategories.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                <div className="flex items-center gap-1 md:gap-2 w-[45%] md:w-auto"><select className="border rounded p-1 outline-none focus:border-black w-full md:w-[120px]" value={filterCard} onChange={(e) => setFilterCard(e.target.value)}><option value="ALL">전체 카드</option>{Array.from(new Set(expenses.map(e => e.card_company))).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <Card>
                <div className="flex justify-between items-end">
                    <div><div className="text-xs md:text-sm text-gray-500 mb-1">선택 기간 총액</div><div className="text-xl md:text-3xl font-bold">{totalAmount.toLocaleString()}원</div></div>
                    <div className="text-right text-[10px] md:text-xs text-gray-400">{expenses.length}건 내역</div>
                </div>
            </Card>
            <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-xs md:text-sm text-left relative">
                        <thead className="text-gray-500 bg-gray-50 border-b sticky top-0 z-10 shadow-sm text-[10px] md:text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-3 py-2 md:px-6 md:py-3 font-medium whitespace-nowrap">이용일</th>
                                <th className="px-3 py-2 md:px-6 md:py-3 font-medium whitespace-nowrap hidden md:table-cell">결제일</th>
                                <th className="px-3 py-2 md:px-6 md:py-3 font-medium whitespace-nowrap">카테고리</th>
                                <th className="px-3 py-2 md:px-6 md:py-3 font-medium whitespace-nowrap">내역</th>
                                <th className="px-3 py-2 md:px-6 md:py-3 font-medium text-right whitespace-nowrap">금액</th>
                                <th className="px-3 py-2 md:px-6 md:py-3 font-medium whitespace-nowrap hidden md:table-cell">카드사</th>
                                <th className="px-3 py-2 md:px-6 md:py-3 font-medium text-center whitespace-nowrap">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {loading ? ( <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">로딩 중...</td></tr> ) 
                            : expenses.length === 0 ? ( <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">내역이 없습니다.</td></tr> ) 
                            : ( expenses.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-3 py-2 md:px-6 md:py-3 text-gray-600 font-mono whitespace-nowrap">{item.transaction_date.slice(5)}<div className="text-[9px] text-gray-400 md:hidden">{item.card_company}</div></td>
                                        <td className="px-3 py-2 md:px-6 md:py-3 text-gray-400 font-mono hidden md:table-cell">{item.payment_date || '-'}</td>
                                        <td className="px-3 py-2 md:px-6 md:py-3"><CategoryCell item={item} categories={categories} onUpdate={handleInlineUpdate} /></td>
                                        <td className="px-3 py-2 md:px-6 md:py-3 font-medium text-gray-900 truncate max-w-[120px] md:max-w-[240px]">{item.description}</td>
                                        <td className="px-3 py-2 md:px-6 md:py-3 text-right font-medium text-gray-900 whitespace-nowrap">{item.amount.toLocaleString()}</td>
                                        <td className="px-3 py-2 md:px-6 md:py-3 text-gray-400 text-xs hidden md:table-cell">{item.card_company}</td>
                                        <td className="px-3 py-2 md:px-6 md:py-3 flex justify-center gap-1 md:gap-2"><button onClick={() => setEditingItem(item)} className="p-1 hover:bg-gray-200 rounded text-blue-600"><Edit2 className="w-3 h-3 md:w-4 md:h-4"/></button><button onClick={() => handleDelete(item.id)} className="p-1 hover:bg-gray-200 rounded text-red-600"><Trash2 className="w-3 h-3 md:w-4 md:h-4"/></button></td>
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
            {/* ✅ 설정 탭 헤더 */}
            <div className="flex border-b mb-6">
                <button 
                    onClick={() => setSettingsTab('card')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative ${settingsTab === 'card' ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    카드 설정
                    {settingsTab === 'card' && <motion.div layoutId="underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
                </button>
                <button 
                    onClick={() => setSettingsTab('category')}
                    className={`px-6 py-3 font-medium text-sm transition-colors relative ${settingsTab === 'category' ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    카테고리 설정
                    {settingsTab === 'category' && <motion.div layoutId="underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
                </button>
            </div>

            {/* 카드 설정 컨텐츠 */}
            {settingsTab === 'card' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2 overflow-hidden">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5"/> 등록된 결제 수단</h2>
                        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 border-b whitespace-nowrap"><tr><th className="px-3 py-2 md:px-4">명칭</th><th className="px-3 py-2 md:px-4">유형</th><th className="px-3 py-2 md:px-4">결제일</th><th className="px-3 py-2 md:px-4">시작일</th><th className="px-3 py-2 md:px-4">관리</th></tr></thead><tbody className="divide-y">{cardSettings.map(setting => <RowSetting key={setting.card_company} setting={setting} onSave={handleSaveSetting} onDelete={handleDeleteSetting} />)}</tbody></table></div>
                    </Card>
                    <Card className="h-fit">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><Plus className="w-4 h-4"/> 새 결제 수단</h3>
                        <div className="space-y-3">
                            <div><label className="text-xs font-bold text-gray-500 block mb-1">명칭</label><input type="text" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} className="w-full border rounded p-2 text-sm" placeholder="예: 현금, 삼성"/></div>
                            <div><label className="text-xs font-bold text-gray-500 block mb-1">유형</label><select value={newType} onChange={(e) => setNewType(e.target.value as any)} className="w-full border rounded p-2 text-sm"><option value="sliding">신용카드</option><option value="immediate">현금/즉시</option></select></div>
                            {newType === 'sliding' && (<div className="grid grid-cols-2 gap-2"><div><label className="text-xs font-bold text-gray-500 block mb-1">결제일</label><input type="number" value={newPayDay} onChange={(e) => setNewPayDay(e.target.value)} className="w-full border rounded p-2 text-sm"/></div><div><label className="text-xs font-bold text-gray-500 block mb-1">시작일</label><input type="number" value={newStartDay} onChange={(e) => setNewStartDay(e.target.value)} className="w-full border rounded p-2 text-sm"/></div></div>)}
                            <button onClick={() => handleSaveSetting(newCardName, Number(newPayDay), Number(newStartDay), newType)} className="w-full bg-black text-white py-3 rounded-md text-sm font-bold hover:bg-gray-800">추가하기</button>
                        </div>
                    </Card>
                </div>
            )}

            {/* ✅ 카테고리 설정 컨텐츠 (새로 추가됨) */}
            {settingsTab === 'category' && (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold flex items-center gap-2"><Tag className="w-5 h-5"/> 카테고리 관리</h2>
                        <button onClick={() => setEditingCategory(null)} className="flex items-center gap-1 bg-black text-white px-3 py-2 rounded text-sm font-medium hover:bg-gray-800"><Plus className="w-4 h-4"/> 새 카테고리</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(groupedCategories).map(([parent, list]) => (
                            <Card key={parent} className="h-fit">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                                    <FolderTree className="w-4 h-4 text-gray-500"/>
                                    <span className="font-bold text-base">{parent}</span>
                                </div>
                                <ul className="space-y-2">
                                    {list.map(cat => (
                                        <li key={cat.id} className="flex items-center justify-between group p-2 rounded hover:bg-gray-50">
                                            <div className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full" style={{backgroundColor: cat.color}} />
                                                <span className="text-sm text-gray-700">{cat.name}</span>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingCategory(cat)} className="p-1 hover:bg-gray-200 rounded text-blue-600"><Edit2 className="w-3 h-3"/></button>
                                                <button onClick={() => handleDeleteCategory(cat.id)} className="p-1 hover:bg-gray-200 rounded text-red-600"><Trash2 className="w-3 h-3"/></button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
      )}

      {showAddModal && <ManualAddModal categories={categories} settings={cardSettings} onClose={() => setShowAddModal(false)} onSave={handleManualAdd} />}
      {editingItem && <EditModal item={editingItem} categories={categories} onClose={() => setEditingItem(null)} onSave={handleSaveEdit} />}
      {showLinkModal && <CardLinkModal onClose={() => setShowLinkModal(false)} />}
      
      {/* ✅ 카테고리 모달 렌더링 */}
      {editingCategory !== undefined && <CategoryModal category={editingCategory} onClose={() => setEditingCategory(undefined)} onSave={handleSaveCategory} />}
    </div>
  )
}