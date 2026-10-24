'use client';

import React from 'react';
import { 
  Sparkles, 
  FileText, 
  BookOpen, 
  Lightbulb, 
  BarChart3, 
  Calculator, 
  FlaskConical, 
  Landmark, 
  Code, 
  Globe, 
  Bot,
  MessageSquare,
  ArrowRight
} from 'lucide-react';

interface GradieWelcomeProps {
  userName?: string;
  onSelectPrompt: (prompt: string) => void;
  onSelectAssistant: (assistantName: string, promptPrefix: string) => void;
}

export default function GradieWelcome({
  userName,
  onSelectPrompt,
  onSelectAssistant,
}: GradieWelcomeProps) {
  const suggestions = [
    {
      icon: <FileText className="w-4 h-4 text-blue-400" />,
      text: 'Résumer un document',
      prompt: 'Peux-tu me faire un résumé clair et synthétique du document que je vais te partager ?',
    },
    {
      icon: <BookOpen className="w-4 h-4 text-emerald-400" />,
      text: 'Expliquer un concept',
      prompt: 'Explique-moi ce concept de manière simple et pédagogique avec un exemple concret :',
    },
    {
      icon: <Lightbulb className="w-4 h-4 text-amber-400" />,
      text: 'Générer des idées',
      prompt: 'Aide-moi à trouver des idées originales et structurées pour :',
    },
    {
      icon: <BarChart3 className="w-4 h-4 text-purple-400" />,
      text: 'Analyser des données',
      prompt: 'Aide-moi à analyser et interpréter les données ou le tableau suivant :',
    },
  ];

  const assistants = [
    {
      id: 'maths',
      name: 'Mathématiques',
      icon: <Calculator className="w-4 h-4 text-cyan-400" />,
      emoji: '📐',
      color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30 text-cyan-300',
      prefix: 'En tant qu\'expert en Mathématiques, aide-moi à résoudre ou comprendre :',
    },
    {
      id: 'francais',
      name: 'Français',
      icon: <BookOpen className="w-4 h-4 text-emerald-400" />,
      emoji: '📖',
      color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-300',
      prefix: 'En tant qu\'expert en Langue et Littérature française, révise ou explique :',
    },
    {
      id: 'sciences',
      name: 'Sciences',
      icon: <FlaskConical className="w-4 h-4 text-purple-400" />,
      emoji: '🔬',
      color: 'from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-300',
      prefix: 'En tant qu\'assistant scientifique (Physique, Chimie, SVT), explique-moi :',
    },
    {
      id: 'histoire',
      name: 'Histoire-Géo',
      icon: <Landmark className="w-4 h-4 text-amber-400" />,
      emoji: '🏛️',
      color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-300',
      prefix: 'En tant qu\'historien et géographe, présente-moi les faits ou repères sur :',
    },
    {
      id: 'informatique',
      name: 'Informatique',
      icon: <Code className="w-4 h-4 text-blue-400" />,
      emoji: '💻',
      color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30 text-blue-300',
      prefix: 'En tant qu\'expert en Informatique et Programmation, conseille-moi sur :',
    },
    {
      id: 'langues',
      name: 'Langues',
      icon: <Globe className="w-4 h-4 text-rose-400" />,
      emoji: '🌍',
      color: 'from-rose-500/20 to-red-500/20 border-rose-500/30 text-rose-300',
      prefix: 'En tant que tuteur en Langues vivantes, aide-moi à traduire ou pratiquer :',
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-5 px-3 sm:px-6 text-center max-w-3xl mx-auto animate-ios-fade-in select-none">
      {/* Animated Avatar Icon */}
      <div className="relative mb-3 group">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/25">
          <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0A0A0F] flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </div>
      </div>

      {/* Welcome Title */}
      <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-1">
        Bonjour{userName ? ` ${userName.split(' ')[0]}` : ''}
      </h1>
      <p className="text-sm text-white/55 mb-5 max-w-md">
        Qu&apos;est-ce qu&apos;on apprend aujourd&apos;hui ?
      </p>

      {/* Suggested Chips Section */}
      <div className="w-full mb-5 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2 px-1 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" /> Pour commencer
        </p>
        <div className="grid grid-cols-2 gap-2">
          {suggestions.map((item, i) => (
            <button
              key={i}
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex min-h-12 items-center gap-2 bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 rounded-xl p-2.5 transition-all text-left group"
            >
              <div className="p-1.5 rounded-lg bg-white/5 group-hover:bg-white/10 shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors leading-snug">
                  {item.text}
                </p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Specialized Assistants Section */}
      <div className="w-full mb-4 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2 px-1 flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5" /> Assistants spécialisés
        </p>
        <div className="grid grid-cols-3 gap-2">
          {assistants.map((ast) => (
            <button
              key={ast.id}
              onClick={() => onSelectAssistant(ast.name, ast.prefix)}
              className={`flex min-h-10 items-center justify-center gap-1.5 bg-gradient-to-r ${ast.color} border rounded-xl px-2 py-2 text-left active:scale-[0.98] transition-all`}
            >
              <span className="text-sm shrink-0">{ast.emoji}</span>
              <span className="text-[10px] sm:text-xs font-bold truncate">{ast.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Discreet Context Reminder */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/5 text-white/35 text-[10px]">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>Gradi se souvient du contexte de chaque conversation</span>
      </div>
    </div>
  );
}
