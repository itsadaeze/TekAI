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
//   const navigate = useNavigate();
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
    const stored = localStorage.getItem("simbiHistory");
    return stored ? JSON.parse(stored) : [];
  });

  const storedUser = localStorage.getItem("simbiUser");
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
        localStorage.setItem("simbiHistory", JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      console.error("Mistral API error:", error);
      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: "Sorry, something went wrong." },
      ]);
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

  return (
    <div className="flex justify-between w-full">
      {/* Sidebar toggle */}
      <div
        className="absolute  top-2 flex gap-3 bg-white rounded-lg px-1 py-2 cursor-pointer z-3 "
        onClick={() => setHistoryVisible((prev) => !prev)}
      >
        <img src="/assets/icons/Simbi-logo.svg" alt="logo" />
        <img src="/assets/icons/cuida_sidebar.svg" alt="collapse" />
      </div>

      {/* History */}
      {historyVisible && (
        <aside className="h-screen w-56 mt-12 p-4 overflow-y-auto bg-white z-10 ">
          <h2 className="mb-2 font-bold text-black text-lg">History</h2>
          {history.map((entry, idx) => (
            <div key={idx} className="mb-4">
              <strong>{formatDateLabel(entry.date)}</strong>
              <ul>
                {entry.questions.map((q, qIdx) => (
                  <li key={qIdx}>
                    <button
                      className="w-full text-left text-gray-700 hover:bg-gray-100 rounded-md px-2 py-1"
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
      )}

      {/* Main Chat Area */}
      <div className="flex-1 px-4 pr-16">
        {/* Suggestions */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-12 text-center">
            <img
              src="/assets/icons/Simbi-logo.svg"
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
                  className="bg-gray-100 text-sm px-4 text-blck py-2 rounded hover:bg-gray-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Chat Messages */}
        <div className="mt-6 space-y-3">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`px-4 py-2 max-w-4xl rounded-md ${
                msg.sender === "user" ? "bg-blue-100 ml-auto max-w-sm" : "bg-gray-100 mr-auto"
              }`}
            >
              {msg.text}
            </div>
          ))}
          {loading && <div className="bg-gray-100 px-4 py-2 rounded-md mr-auto">Typing...</div>}
          <div ref={bottomRef} />
        </div>
       
   
        {/* Input Area */}
        <div className="mt-6 flex items-end mx-auto w-2/3 gap-3 justify-end">
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
            placeholder="Ask SIMBI anything"
            className="flex-1  p-6 border border-gray-300 rounded-xl resize-none relative"
          />

          <div className="flex gap-2 items-center absolute ">
            <button
              onClick={() => handleSendQuestion(questionInput)}
              disabled={loading}
              className="p-2 rounded  bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
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






