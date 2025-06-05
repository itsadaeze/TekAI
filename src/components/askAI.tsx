/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import {
  FiMic,
  FiMicOff,
  FiVolume2,
  FiVolumeX,
  FiSave,
  FiSidebar,
  FiPlusCircle,
} from "react-icons/fi";

import { TbSend } from "react-icons/tb";

// Types
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

// Get user from localStorage
const storedUser = localStorage.getItem("tekUser");
const parsedUser = storedUser ? JSON.parse(storedUser) : null;


// Component
const AskAi: React.FC = () => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionType> | null>(
    null
  );
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  const[userName, setUserName] = useState(
    parsedUser?.name || parsedUser?.given_name || "User"
  );
  const [showUsernameModal, setShowUsernameModal] = useState(!parsedUser);
  const [tempUsername, setTempUsername] = useState("");
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

  const [typingText, setTypingText] = useState<string | null>(null);
  const [currentTypingIndex, setCurrentTypingIndex] = useState<number>(0);


  const suggestions = ["Give me a study tip", "Quiz me now", "Motivate me!"];

  // Auto-scroll on message update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Setup speech recognition
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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setHistoryVisible(false); // Hide on small screens
      } else {
        setHistoryVisible(true); // Show on desktop
      }
    };

    handleResize(); // run on mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typingText === null) return;

    if (currentTypingIndex < typingText.length) {
      const timeout = setTimeout(() => {
        const currentText = typingText.slice(0, currentTypingIndex + 1);
        // Replace the last AI message or add a new one if none exists yet
        setMessages((prevMessages) => {
          const updated = [...prevMessages];
          const lastMessage = updated[updated.length - 1];

          if (lastMessage?.sender === "ai") {
            updated[updated.length - 1] = { sender: "ai", text: currentText };
          } else {
            updated.push({ sender: "ai", text: currentText });
          }

          return updated;
        });

        setCurrentTypingIndex((prev) => prev + 1);
      }, 50); // speed of typing

      return () => clearTimeout(timeout);
    } else {
      // Typing finished
      setTypingText(null);
      setCurrentTypingIndex(0);
    }
  }, [typingText, currentTypingIndex]);
  
  const handleSendQuestion = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { sender: "user", text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setQuestionInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "48px"; 
    }
    
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

      const aiText =
        res.data.choices?.[0]?.message?.content ?? "No response received.";
      // const aiMessage: Message = { sender: "ai", text: aiText };
      // setMessages((prev) => [...prev, aiMessage]);

      setTypingText(aiText);
      setCurrentTypingIndex(0);


      const today = new Date().toDateString();
      const newEntry = { question: text, answer: aiText };

      setHistory((prev) => {
        const updated = [...prev];
        const todayEntry = updated.find((entry) => entry.date === today);
        if (todayEntry) {
          todayEntry.questions.unshift(newEntry);
        } else {
          updated.unshift({ date: today, questions: [newEntry] });
        }
        localStorage.setItem("tekHistory", JSON.stringify(updated));
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

  const handleNewChat = () => {
    setMessages([]);
    setQuestionInput("");
  };

  const handleExportChat = () => {
    const content = messages
      .map((m) => `${m.sender.toUpperCase()}: ${m.text}`)
      .join("\n\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tekai-chat.txt";
    a.click();
    URL.revokeObjectURL(url);
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
    <div>
      {showUsernameModal && (
        <div className="fixed inset-0  bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1d1c1c] px-6 py-10 rounded-lg shadow-md max-w-sm w-full">
            <h2 className="text-xl text-[#b0aaaa] font-semibold mb-4 text-center">
              Welcome!
            </h2>
            <p className="mb-2 text-[#b0aaaa] text-center">
              What's your preferred username?
            </p>
            <input
              type="text"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              className="w-full p-2 border text-[#b0aaaa] mt-4 border-gray-300 rounded mb-4"
              placeholder="Enter your name"
            />
            <button
              onClick={() => {
                const trimmed = tempUsername.trim();
                if (trimmed) {
                  const newUser = { name: trimmed };
                  localStorage.setItem("tekUser", JSON.stringify(newUser));
                  setUserName(trimmed); // ✅ update state immediately
                  setShowUsernameModal(false);
                }
              }}
              className="bg-blue-500 text-white mt-4 w-full py-2 rounded hover:bg-blue-600"
            >
              Save
            </button>
          </div>
        </div>
      )}
      <div className="mt-6 space-y-3 w-full flex justify-center items-center  px-4 sm:px-6 md:px-8">
        {/* Sidebar Toggle */}

        {/* <div
          className={`fixed top-4  -left-56 z-50 flex bg-[#151515] text-white justify-between w-56 items-center gap-2 p-2  transition-transform duration-300 cursor-pointer ${
            historyVisible ? "translate-x-56" : "translate-x-16"
          }`}
          onClick={() => setHistoryVisible((prev) => !prev)}
        > */}
        <div
          className={`fixed top-4 -left-56 z-50 flex bg-[#151515] text-white justify-between w-56 items-center gap-2 p-2 rounded-r-lg shadow transition-transform duration-300 cursor-pointer ${
            historyVisible ? "translate-x-56" : "translate-x-16"
          }`}
          onClick={() => setHistoryVisible((prev) => !prev)}
        >
          {/* <FaRegComments className="w-6 h-6 text-black" /> */}
          <p>TekAI</p>
          <FiSidebar className="w-4 h-4 " />
        </div>
        <div className="fixed top-4 right-0 z-50 flex items-center gap-2 p-2  rounded-r-lg shadow transition-transform duration-300 cursor-pointer">
          <button
            onClick={handleExportChat}
            className="bg-black  text-white px-4 py-2 rounded-full flex items-center gap-2"
          >
            <FiSave size={20} />
          </button>
        </div>

        {/* Sidebar */}
        <aside
          className={`fixed top-0  left-0 h-screen w-56 mt-10 p-4 pt-16 bg-[#151515] overflow-y-auto z-40 shadow transition-transform duration-500 ease-in-out ${
            historyVisible ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            onClick={handleNewChat}
            className="bg-white text-black px-4 py-2 rounded mb-4 flex items-center gap-2"
          >
            <FiPlusCircle />
            New Chat
          </button>
          <h2 className="mb-2 font-bold text-[#ece2e2] text-lg">History</h2>
          {history.map((entry, idx) => (
            <div key={idx} className="mb-4">
              <strong className="text-[#928e8e]">
                {formatDateLabel(entry.date)}
              </strong>
              <ul>
                {entry.questions.map((q, qIdx) => (
                  <li key={qIdx}>
                    <button
                      className="w-full text-left text-[#c2bbbb] hover:bg-[#2e2929] rounded-md px-2 py-1"
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

        {/* Main Chat Area */}
        <div className="flex-1 px-2 md:px-4 flex w-full  flex-col justify-center h-screen items-center">
          {messages.length === 0 && (
            <div className="flex flex-col  items-center justify-center mt-12 text-center">
              {/* <img src="/assets/icons/tek-logo.svg" alt="Logo" className="w-38 h-12" /> */}
              <p className="font-bold text-2xl text-white">Hi {userName} 👋!</p>

              <h6 className="text-2xl text-white font-medium mt-4">
                How can I help you?
              </h6>
              <div className="flex gap-3 mt-3 wrap-break-word">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendQuestion(s)}
                    className="bg-gray-100  text-sm px-2 text-black py-2 rounded hover:bg-gray-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3 w-[65%] mx-auto ">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`px-4 py-2 rounded-2xl fade-in ${
                  msg.sender === "user"
                    ? "bg-[#3a3838] ml-auto w-[30%] text-gray-400 wrap-break-word"
                    : "bg-[#1e1c1c] mr-auto text-gray-400 "
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
              <div className="bg-[#1e1c1c] text-white px-4 py-2 rounded-md mr-auto animate-pulse">
                ...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input & Actions*/}

          <div className="mt-2 md:mt-6 flex items-end w-full md:w-[70%] lg:w-[50%]  justify-center gap-3">
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                rows={1}
                maxLength={500}
                value={questionInput}
                onChange={(e) => {
                  setQuestionInput(e.target.value);
                  if (textareaRef.current) {
                    // Only grow the height
                    textareaRef.current.style.height = "auto";
                    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
                  }
                }}
                placeholder="Ask TekAI anything"
                // className="w-full py-14 pr-36 pl-8 shadow-2xl rounded-4xl text-white bg-gray-700 resize-none"
                className="w-full min-h-[48px] py-14 pr-36 pl-8 shadow-2xl rounded-3xl text-white bg-[#3a3838] resize-none transition-all"
              />

              <div className="absolute right-6 bottom-5 flex gap-2">
                <button
                  onClick={() => handleSendQuestion(questionInput)}
                  disabled={loading}
                  className="p-2 rounded  text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  <TbSend
                    className={`w-5 h-5 ${loading ? "animate-pulse" : ""}`}
                  />
                </button>

                <button
                  onClick={() => {
                    const last = [...messages]
                      .reverse()
                      .find((m) => m.sender === "ai");
                    if (last) speakText(last.text);
                  }}
                  disabled={!messages.some((m) => m.sender === "ai")}
                  className="p-2 rounded border text-blue-500 hover:bg-gray-100"
                >
                  {isSpeaking ? (
                    <FiVolumeX className="w-5 h-5" />
                  ) : (
                    <FiVolume2 className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={isListening ? stopListening : startListening}
                  className="p-2 rounded border text-blue-500 hover:bg-gray-100"
                >
                  {isListening ? (
                    <FiMicOff className="w-5 h-5" />
                  ) : (
                    <FiMic className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AskAi;



