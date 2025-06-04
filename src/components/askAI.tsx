/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

interface Message {
  sender: "user" | "ai";
  text: string;
}

interface HistoryEntry {
  date: string;
  questions: { question: string; answer: string }[];
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }

  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}

type SpeechRecognitionType =
  | typeof window.SpeechRecognition
  | typeof window.webkitSpeechRecognition;

const AskAi: React.FC = () => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [questionInput, setQuestionInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const stored = localStorage.getItem("tekHistory");
    return stored ? JSON.parse(stored) : [];
  });

  const storedUser = localStorage.getItem("tekUser");
  const parsedUser = storedUser ? JSON.parse(storedUser) : null;
  const userName = parsedUser?.name || parsedUser?.given_name || "User";

  const suggestions = ["Give me a study tip", "Quiz me now", "Motivate me!"];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setQuestionInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const speakText = (text: string) => {
    if ("speechSynthesis" in window && text) {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      } else {
        const utterance = new SpeechSynthesisUtterance(text);
        synthesisRef.current = utterance;

        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = (event) => {
          console.error("Speech synthesis error:", event.error);
          setIsSpeaking(false);
        };

        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      }
    }
  };

  const handleSendQuestion = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { sender: "user", text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setQuestionInput("");
    setLoading(true);

    try {
      const mistralMessages = [
        {
          role: "system",
          content: "You are a helpful AI study assistant named TekAI.",
        },
        ...updatedMessages.map((msg) => ({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.text,
        })),
      ];

      const res = await axios.post(
        "https://api.mistral.ai/v1/chat/completions",
        {
          model: "mistral-tiny",
          messages: mistralMessages,
        },
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const aiText = res.data.choices?.[0]?.message?.content ?? "No response received.";
      const aiMessage: Message = { sender: "ai", text: aiText };
      setMessages((prev) => [...prev, aiMessage]);

      const today = new Date().toDateString();
      const newEntry = { question: text, answer: aiText };
      setHistory((prev) => {
        const updated = [...prev];
        const todayEntry = updated.find((entry) => entry.date === today);
        if (todayEntry) {
          todayEntry.questions.push(newEntry);
        } else {
          updated.unshift({ date: today, questions: [newEntry] });
        }
        localStorage.setItem("tekHistory", JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      console.error("Mistral API error:", error);
      setMessages((prev) => [...prev, { sender: "ai", text: "Sorry, something went wrong." }]);
    } finally {
      setLoading(false);
    }
  };

  const formatDateLabel = (dateStr: string) => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (dateStr === today) return "Today";
    if (dateStr === yesterday) return "Yesterday";
    return dateStr;
  };

  const handleHistoryClick = (question: string, answer: string) => {
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: question },
      { sender: "ai", text: answer },
    ]);
  };

  const handleNewChat = () => {
    setMessages([]);
    setQuestionInput("");
  };

  const handleExportChat = () => {
    const content = messages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join("\n\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tekai-chat.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full  bg-black ">
      {/* <aside
        className={`h-screen w-56 mt-12 p-4 overflow-y-auto bg-white z-10 transition-all duration-500 ease-in-out transform ${
          historyVisible ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div
          className="absolute top-2 flex gap-3 w-56 bg-white rounded-t-lg px-1 py-2 cursor-pointer z-3"
          onClick={() => setHistoryVisible((prev) => !prev)}
        >
          <img src="/assets/icons/tek-logo.svg" alt="logo" />
          <img src="/assets/icons/cuida_sidebar.svg" alt="collapse" />
          <button
            onClick={handleNewChat}
            className="bg-green-500 text-black px-4 py-2 rounded"
          >
            New Chat
          </button>
        </div>
        <h2 className="mb-2 font-bold text-black text-lg">History</h2>
        {history.map((entry, idx) => (
          <div key={idx} className="mb-4">
            <strong>{formatDateLabel(entry.date)}</strong>
            <ul>
              {entry.questions.map((q, qIdx) => (
                <li key={qIdx}>
                  <button
                    className="w-full text-left text-black hover:bg-gray-100 rounded-md px-2 py-1"
                    onClick={() => handleHistoryClick(q.question, q.answer)}
                  >
                    {q.question.length > 20
                      ? q.question.slice(0, 17) + "..."
                      : q.question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside> */}
      {/* Sidebar Toggle Button (Always Visible) */}
      <div
        className={`fixed top-4 left-2 z-50 flex items-center gap-2 p-2 bg-white rounded-r-lg shadow transition-transform duration-300 cursor-pointer ${
          historyVisible ? "translate-x-56" : ""
        }`}
        onClick={() => setHistoryVisible((prev) => !prev)}
      >
        <img src="/assets/icons/tek-logo.svg" alt="logo" className="w-6 h-6" />
        <img
          src="/assets/icons/cuida_sidebar.svg"
          alt="toggle"
          className="w-4 h-4"
        />
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-56 p-4 pt-16 bg-white overflow-y-auto z-40 shadow transition-transform duration-500 ease-in-out ${
          historyVisible ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={handleNewChat}
          className="bg-green-500 text-black px-4 py-2 rounded mb-4"
        >
          New Chat
        </button>
        <h2 className="mb-2 font-bold text-black text-lg">History</h2>
        {history.map((entry, idx) => (
          <div key={idx} className="mb-4">
            <strong>{formatDateLabel(entry.date)}</strong>
            <ul>
              {entry.questions.map((q, qIdx) => (
                <li key={qIdx}>
                  <button
                    className="w-full text-left text-black hover:bg-gray-100 rounded-md px-2 py-1"
                    onClick={() => handleHistoryClick(q.question, q.answer)}
                  >
                    {q.question.length > 20
                      ? q.question.slice(0, 17) + "..."
                      : q.question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <div className="flex-1 px-4 pr-16 flex flex-col items-center">
        <div className="mt-4 flex gap-4">
          <button
            onClick={handleExportChat}
            className="bg-yellow-500 text-white px-4 py-2 rounded"
          >
            Save Chat
          </button>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-12 text-center">
            <img
              src="/assets/icons/tek-logo.svg"
              alt="Logo"
              className="w-38 h-12"
            />
            <p className="text-base">Hi {userName} 👋!</p>
            <h6 className="text-xl font-medium">How can I help you?</h6>
            <div className="flex gap-3 mt-3">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendQuestion(suggestion)}
                  className="bg-gray-100 text-sm px-4 text-white py-2 rounded hover:bg-gray-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3 w-full max-w-4xl">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`px-4 py-2 rounded-md fade-in ${
                msg.sender === "user"
                  ? "bg-blue-100 ml-auto max-w-sm"
                  : "bg-gray-100 mr-auto"
              }`}
            >
              {msg.text.split("\n").map((line, idx) => (
                <p key={idx} className="mb-2">
                  {line}
                </p>
              ))}
            </div>
          ))}
          {loading && (
            <div className="bg-gray-100 px-4 py-2 rounded-md mr-auto animate-pulse">
              Typing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-6 flex items-end w-2/3 gap-3">
          <textarea
            ref={textareaRef}
            rows={1}
            maxLength={500}
            value={questionInput}
            onChange={(e) => {
              setQuestionInput(e.target.value);
              if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
                textareaRef.current.style.height = `${Math.min(
                  textareaRef.current.scrollHeight,
                  96
                )}px`;
              }
            }}
            placeholder="Ask TekAI anything"
            className="flex-1 p-6 border border-gray-300 rounded-xl text-white resize-none"
          />

          <div className="flex gap-2 items-center">
            <button
              onClick={() => handleSendQuestion(questionInput)}
              disabled={loading}
              className="p-2 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              <img
                src={
                  loading ? "/assets/icons/block.svg" : "/assets/icons/send.svg"
                }
                alt="send"
                className="w-5 h-5"
              />
            </button>
            <button
              onClick={() => {
                const lastMessage = [...messages]
                  .reverse()
                  .find((m) => m.sender === "ai");
                if (lastMessage) speakText(lastMessage.text);
              }}
              disabled={!messages.some((m) => m.sender === "ai")}
              className="p-2 rounded border hover:bg-gray-100"
            >
              <img
                src={
                  isSpeaking
                    ? "/assets/icons/stop_circle.svg"
                    : "/assets/icons/play.svg"
                }
                alt={isSpeaking ? "stop" : "play"}
                className="w-5 h-5"
              />
            </button>
            <button
              onClick={isListening ? stopListening : startListening}
              className="p-2 rounded border hover:bg-gray-100"
            >
              <img
                src={
                  isListening
                    ? "/assets/icons/mic_off.svg"
                    : "/assets/icons/mic.svg"
                }
                alt="mic"
                className="w-5 h-5"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AskAi;

// CSS (e.g. in index.css or tailwind globals)
// .fade-in {
//   animation: fadeIn 0.8s ease-in forwards;
// }
// @keyframes fadeIn {
//   from { opacity: 0; transform: translateY(10px); }
//   to { opacity: 1; transform: translateY(0); }
// }

